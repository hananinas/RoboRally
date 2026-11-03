import { Integer } from '@/numbers'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { submitProgramSchema } from '@robo-rally/game-events'
import type { ClientToServerEvents, CardsDealt, GameWon, RobotActionResolved, GameInitialization, PlayerConnectionChanged, PlayerCheckpointProgress, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Board, Direction, EmptyTile, PitTile, Game, type Tile } from '@/game/index'
import { createGame, createHand } from '@/game/GameFactory'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import { createSessionStore, type SessionStore } from '@/auth/sessionStore'
import { authCookieHeader } from './authTestHelper.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
describe('started game membership over Socket.IO', () => {
  let server: GameSocketServer
  let shared: ReturnType<typeof createGame>
  let sessionStore: SessionStore
  let url: string
  let clients: Client[]
  beforeEach(async () => {
    shared = createGame('empty-map')
    clients = []
    await start()
  })
  async function start() {
    const http = createServer()
    sessionStore = createSessionStore()
    server = createGameSocketServer(http, sessionStore, () => shared)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  }
  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  async function connect(username: string): Promise<Client> {
    const client: Client = io(url, {
      autoConnect: false, transports: ['websocket'], reconnection: false, ackTimeout: 1000,
      extraHeaders: authCookieHeader(sessionStore, username, username),
    })
    clients.push(client)
    const connected = new Promise<void>((resolve) => client.once('connect', resolve))
    client.connect()
    await connected
    return client
  }
  async function getSnapshot(client: Client): Promise<GameInitialization> {
    const result = await client.emitWithAck('session.get', {})
    if (result.outcome !== 'IN_GAME') throw new Error(result.outcome)
    return result.initialization
  }
  async function startGame(names: string[]) {
    const members = await Promise.all(names.map(connect))
    const created = await members[0].emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    const { lobbyId } = created.lobby
    for (const member of members.slice(1)) await member.emitWithAck('lobby.join', { lobbyId })
    const ready = members.map((member) => new Promise<GameInitialization>((resolve) => member.once('game.started', ({ initialization }) => resolve(initialization))))
    expect((await members[0].emitWithAck('lobby.start', { lobbyId })).outcome).toBe('STARTED')
    return { members, initializations: await Promise.all(ready) }
  }
  async function disconnect(client: Client, recoverable = false) {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    if (recoverable) client.io.engine.close()
    else client.disconnect()
    await closed
  }
  const submission = (initial: GameInitialization) => submitProgramSchema.parse({
    gameId: initial.assignment.gameId, playerId: initial.assignment.playerId,
    cardIds: initial.hand.slice(0, 5).map((card) => card.id),
  })
  function raw(client: Client, event: string, payload: unknown): Promise<unknown> {
    return (client.emitWithAck as (event: string, payload: unknown) => Promise<unknown>)(event, payload)
  }

  it('rejects malformed session requests and starts with no session', async () => {
    const client = await connect('Dane')
    expect(await raw(client, 'session.get', { gameId: shared.gameId })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION', user: { userId: 'Dane', username: 'Dane' } })
    expect(server.sockets.sockets.get(client.id!)!.rooms).toEqual(new Set([client.id]))
  })
  it('returns the same assignment and hand on repeated session discovery', async () => {
    const { members: [first], initializations: [initial] } = await startGame(['First', 'Second'])
    const repeated = await getSnapshot(first)
    expect(repeated).toEqual(initial)
    expect(shared.game.players).toHaveLength(2)
  })
  it('rejects nonmember, other-player and foreign-hand submissions', async () => {
    const { members: [first, second], initializations: [initial, other] } = await startGame(['First', 'Second'])
    const outsider = await connect('Outside')
    expect(await outsider.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await second.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
    expect(await first.emitWithAck('program.submit', { ...submission(other), playerId: initial.assignment.playerId })).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect((await getSnapshot(first)).programSubmitted).toBe(true)
    expect((await getSnapshot(second)).hand).toEqual(other.hand)
  })
  it('revokes room access and frees occupancy when a member explicitly leaves', async () => {
    const { members: [first, second], initializations: [initial] } = await startGame(['First', 'Second'])
    const left = new Promise((resolve) => second.once('game.playerLeft', resolve))
    expect(await raw(first, 'game.leave', { gameId: shared.gameId, extra: true })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await first.emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'LEFT' })
    expect(await left).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, robotId: initial.assignment.robotId })
    expect(shared.game.board.occupantAt({ x: Integer(10), y: Integer(7) })).toBeUndefined()
    expect(server.sockets.sockets.get(first.id!)!.rooms).toEqual(new Set([first.id]))
    expect(await first.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION', user: { userId: 'First', username: 'First' } })
    expect(await first.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
  })
  it('completes the programming barrier when an unsubmitted member leaves', async () => {
    const { members: [first, second], initializations: [initial] } = await startGame(['First', 'Second'])
    await first.emitWithAck('program.submit', submission(initial))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))
    await second.emitWithAck('game.leave', { gameId: shared.gameId })
    expect(await hand).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand })
    expect(shared.game.phase).toBe('programming')
  })
  it('preserves assignments, hands and checkpoint progress while pausing for disconnected members', async () => {
    const { members: [first, second, witness], initializations: [initial, other, observer] } = await startGame(['First', 'Second', 'Witness'])
    shared.game.players[0].completeCheckpoint(1)
    const changed: PlayerConnectionChanged[] = []
    witness.on('game.playerConnectionChanged', (event) => changed.push(event))
    await disconnect(first)
    await disconnect(second)
    expect(shared.game.paused).toBe(true)
    expect(await witness.emitWithAck('program.submit', submission(observer))).toEqual({ outcome: 'GAME_PAUSED' })
    const returnedFirst = await connect('First')
    const restoredFirst = await getSnapshot(returnedFirst)
    expect(restoredFirst.assignment).toEqual(initial.assignment)
    expect(restoredFirst.hand).toEqual(initial.hand)
    expect(restoredFirst.state.players[0].lastCheckpoint).toBe(1)
    expect(restoredFirst.state.paused).toBe(true)
    const returnedSecond = await connect('Second')
    const restoredSecond = await getSnapshot(returnedSecond)
    expect(restoredSecond.assignment).toEqual(other.assignment)
    expect(restoredSecond.state.paused).toBe(false)
    await witness.emitWithAck('session.get', {})
    expect(changed.map((event) => [event.connected, event.paused])).toEqual([[false, true], [false, true], [true, true], [true, false]])
  })
  it('resumes mid-activation after reattaching the last disconnected member', async () => {
    const { members: [first, second] } = await startGame(['First', 'Second'])
    for (const player of shared.game.players) shared.game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    await disconnect(first)
    const actions: unknown[] = []
    second.on('robot.actionResolved', (payload) => actions.push(payload))
    const hand = new Promise((resolve) => second.once('cards.dealt', resolve))
    await getSnapshot(await connect('First'))
    await hand
    expect(actions).toHaveLength(1)
    expect(shared.game.phase).toBe('programming')
    expect(shared.game.paused).toBe(false)
  })
  it('recovers a game socket and resumes without client session discovery', async () => {
    const { members: [first, second] } = await startGame(['First', 'Second'])
    await disconnect(first, true)
    expect(shared.game.paused).toBe(true)
    const resumed = new Promise((resolve) => second.on('game.playerConnectionChanged', (event) => { if (event.connected) resolve(event) }))
    const connected = new Promise<void>((resolve) => first.once('connect', resolve))
    first.connect()
    await connected
    expect(first.recovered).toBe(true)
    expect(await resumed).toMatchObject({ connected: true, paused: false })
  })
  it('rejects stale recovery after another live connection has reclaimed the game membership', async () => {
    const { members: [first] } = await startGame(['First', 'Second'])
    await disconnect(first, true)
    const replacement = await connect('First')
    await getSnapshot(replacement)
    const rejected = new Promise<Error>((resolve) => first.once('connect_error', resolve))
    first.connect()
    expect((await rejected).message).toBe('USER_ALREADY_IN_GAME')
    expect((await getSnapshot(replacement)).state.paused).toBe(false)
  })
  it('rejects recovery when the reconnecting cookie belongs to a different session', async () => {
    const { members: [first] } = await startGame(['First', 'Second'])
    await disconnect(first, true)
    expect(shared.game.paused).toBe(true)
    first.io.opts.extraHeaders = authCookieHeader(sessionStore, 'different-subject')
    const rejected = new Promise<Error>((resolve) => first.once('connect_error', resolve))
    first.connect()
    expect((await rejected).message).toBe('SESSION_MISMATCH')
    expect(shared.game.paused).toBe(true)
  })
  it('keeps the game paused when a reconnect snapshot fails and permits retry', async () => {
    const { members: [first], initializations: [initial] } = await startGame(['First'])
    await disconnect(first)
    const replacement = await connect('First')
    vi.spyOn(shared.game.board, 'getTile').mockImplementationOnce(() => { throw new Error('Snapshot failed') })
    expect(await replacement.emitWithAck('session.get', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(shared.game.paused).toBe(true)
    expect(server.sockets.sockets.get(replacement.id!)!.rooms).toEqual(new Set([replacement.id]))
    expect((await getSnapshot(replacement)).assignment).toEqual(initial.assignment)
    expect(shared.game.paused).toBe(false)
  })
    it('announces the winner instead of dealing hands when a departure completes the final checkpoint', async () => {
    const { members: [first, second] } = await startGame(['First', 'Second'])
    for (const player of shared.game.players) shared.game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    const player = shared.game.players[0]
    expect(player.lastCheckpoint).toBe(1)
    shared.game.board.removeRobot(player.robot.id)
    shared.game.board.placeRobot(player.robot.id, { x: Integer(8), y: Integer(9) })
    const events: string[] = []
    first.onAny((name) => { if (['game.playerLeft', 'player.checkpointProgress', 'game.won', 'cards.dealt'].includes(name)) events.push(name) })
    const progress = new Promise<PlayerCheckpointProgress>((resolve) => first.once('player.checkpointProgress', resolve))
    const won = new Promise<GameWon>((resolve) => first.once('game.won', resolve))
    await second.emitWithAck('game.leave', { gameId: shared.gameId })
    expect(await progress).toEqual({ gameId: shared.gameId, playerId: player.id, lastCheckpoint: 2, checkpointCount: 2 })
    expect(await won).toEqual({ gameId: shared.gameId, playerId: player.id })
    await getSnapshot(first)
    expect(events).toEqual(['game.playerLeft', 'player.checkpointProgress', 'game.won'])
  })

  it('announces the winner after the final checkpoint and ends the game', async () => {
    const { members: [client], initializations: [initial] } = await startGame(['First'])
    const player = shared.game.players[0]
    player.completeCheckpoint(1)
    shared.game.board.relocateRobot(player.robot.id, { x: Integer(8), y: Integer(10) })
    const events: string[] = []
    client.onAny((name) => events.push(name))
    const won = new Promise<GameWon>((resolve) => client.once('game.won', resolve))

    expect(await client.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })

    expect(await won).toEqual({ gameId: shared.gameId, playerId: player.id })
    const snapshot = await getSnapshot(client)
    expect(events).toEqual(['robot.actionResolved', 'player.checkpointProgress', 'game.won'])
    expect(snapshot.state.winner).toBe(player.id)
    expect(snapshot.state.phase).toBe('PROGRAMMING')
    expect(await client.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'GAME_FINISHED' })
  })
  it('ignores commands without acknowledgements', async () => {
    const client = await connect('Abid')
    const emit = client.emit.bind(client) as (event: string, payload: unknown) => void
    emit('lobby.create', {})
    emit('program.submit', {})
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION', user: { userId: 'Abid', username: 'Abid' } })
    expect(shared.game.players).toHaveLength(0)
  })
  it('aborts the game permanently on an unexpected execution failure, still tells (re)joining members, and still allows leaving', async () => {
    const { members: [first, second], initializations: [initial, other] } = await startGame(['First', 'Second'])

    const aborted = new Promise((resolve) => first.once('game.aborted', resolve))
    vi.spyOn(shared.game, 'executeNextAction').mockImplementationOnce(() => { throw new Error('boom') })
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    await second.timeout(1000).emitWithAck('program.submit', submission(other))
    await aborted

    expect(shared.game.aborted).toBe(true)
    expect((await getSnapshot(first)).state.aborted).toBe(true)
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toMatchObject({ outcome: 'GAME_ABORTED' })
    expect(await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId }))
      .toEqual({ outcome: 'LEFT' })
  })

  describe('pit results over Socket.IO', () => {
    beforeEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      const tiles: Tile[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
      tiles[1][2] = new PitTile()
      tiles[4][4] = new EmptyTile([Direction.WEST], 1)
      tiles[4][0] = new EmptyTile([], 2)
      shared = {
        gameId: shared.gameId,
        game: new Game(new Board(tiles, { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }), [], createHand(), { x: Integer(4), y: Integer(4) }),
      }
      await start()
    })

    function program(joined: GameInitialization, indices: readonly number[]) {
      return submitProgramSchema.parse({
        gameId: shared.gameId, playerId: joined.assignment.playerId,
        cardIds: indices.map((index) => joined.hand[index].id),
      })
    }

    it('broadcasts a chain push and its rebooted robot to every client in one action', async () => {
      const { members: sockets, initializations } = await startGame(['Pusher', 'Pushed', 'Falling'])
      const members = sockets.map((client, index) => ({ client, joined: initializations[index] }))
      const robotIds = members.map(({ joined }) => joined.assignment.robotId)
      shared.game.board.relocateRobot(robotIds[0], { x: Integer(2), y: Integer(2) })
      shared.game.board.relocateRobot(robotIds[1], { x: Integer(3), y: Integer(2) })
      shared.game.board.relocateRobot(robotIds[2], { x: Integer(4), y: Integer(2) })
      shared.game.players[0].robot.turn(3)
      shared.game.players[1].robot.turn(2)
      shared.game.players[2].robot.turn(1)
      const actions: RobotActionResolved[][] = members.map(() => [])
      members.forEach(({ client }, index) => client.on('robot.actionResolved', (action) => actions[index].push(action)))
      const hands = members.map(({ client }) => new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve)))
      for (const [index, { client, joined }] of members.entries()) {
        const indices = index === 0 ? [0, 4, 5, 6, 8] : [4, 5, 6, 8, 3]
        expect(await client.timeout(1000).emitWithAck('program.submit', program(joined, indices))).toEqual({ outcome: 'ACCEPTED' })
      }
      await Promise.all(hands)

      expect(actions[0][0]).toEqual({
        gameId: shared.gameId, registerIndex: 0, robotId: robotIds[0], instruction: 'MOVE_1',
        position: { coordinate: { x: 3, y: 2 }, orientation: 'EAST' },
        pushedRobots: [
          { robotId: robotIds[1], position: { coordinate: { x: 4, y: 2 }, orientation: 'SOUTH' } },
          { robotId: robotIds[2], position: { coordinate: { x: 4, y: 4 }, orientation: 'WEST' } },
        ],
      })
      expect(actions[0]).toHaveLength(15)
      expect(actions[1]).toEqual(actions[0])
      expect(actions[2]).toEqual(actions[0])
    })

    it('broadcasts rebooted positions before progress and hands and restores them on rejoining', async () => {
      const { members: [client], initializations: [initial] } = await startGame(['First'])
      expect(initial.state.board.tiles.find((tile) => tile.type === 'PIT'))
        .toEqual({ position: { x: 2, y: 1 }, type: 'PIT' })
      const outsider = await connect('Login only')
      const outsideEvents = vi.fn()
      outsider.onAny(outsideEvents)
      const actions: RobotActionResolved[] = []
      const progress: PlayerCheckpointProgress[] = []
      const events: string[] = []
      client.onAny((name) => events.push(name))
      client.on('robot.actionResolved', (action) => actions.push(action))
      client.on('player.checkpointProgress', (payload) => progress.push(payload))
      const hand = new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve))

      expect(await client.timeout(1000).emitWithAck('program.submit', program(initial, [2, 0, 4, 5, 3])))
        .toEqual({ outcome: 'ACCEPTED' })
      expect(await hand).toEqual({
        gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand,
      })
      expect(actions).toEqual([
        { coordinate: { x: 4, y: 4 }, orientation: 'NORTH' },
        { coordinate: { x: 4, y: 3 }, orientation: 'NORTH' },
        { coordinate: { x: 4, y: 3 }, orientation: 'WEST' },
        { coordinate: { x: 4, y: 3 }, orientation: 'NORTH' },
        { coordinate: { x: 4, y: 4 }, orientation: 'NORTH' },
      ].map((position, registerIndex) => ({
        gameId: shared.gameId, registerIndex, robotId: initial.assignment.robotId,
        pushedRobots: [],
        instruction: initial.hand[[2, 0, 4, 5, 3][registerIndex]].instruction, position,
      })))
      expect(progress).toEqual([{
        gameId: shared.gameId, playerId: initial.assignment.playerId, lastCheckpoint: 1, checkpointCount: 2,
      }])
      expect(events).toEqual([
        'robot.actionResolved', 'player.checkpointProgress',
        ...Array.from({ length: 4 }, () => 'robot.actionResolved'), 'cards.dealt',
      ])
      const snapshot = await getSnapshot(client)
      expect(snapshot.outcome).toBe('JOINED')
      expect(snapshot.state.phase).toBe('PROGRAMMING')
      expect(snapshot.state.robots).toEqual([{
        robotId: initial.assignment.robotId, playerId: initial.assignment.playerId,
        colour: initial.state.robots[0].colour,
        position: actions[4].position,
      }])
      expect(snapshot.state.players[0].lastCheckpoint).toBe(1)
      expect(shared.game.board.occupantAt({ x: Integer(2), y: Integer(1) })).toBeUndefined()
      await outsider.timeout(1000).emitWithAck('session.get', {})
      expect(outsideEvents).not.toHaveBeenCalled()

      await disconnect(client)
      const restored = await getSnapshot(await connect('First'))
      expect(restored.assignment).toEqual(initial.assignment)
      expect(restored.hand).toEqual(initial.hand)
      expect(restored.state.robots).toEqual(snapshot.state.robots)
      expect(restored.state.players[0].lastCheckpoint).toBe(1)
      expect(restored.state.paused).toBe(false)
    })

    it('broadcasts the occupied-tile fallback to every member and uses its position for later priority', async () => {
      const { members: sockets, initializations } = await startGame(['First', 'Second', 'Third'])
      const members = sockets.map((client, index) => ({ client, joined: initializations[index] }))
      const robotIds = members.map(({ joined }) => joined.assignment.robotId)
      shared.game.board.relocateRobot(robotIds[1], { x: Integer(4), y: Integer(4) })
      const actions: RobotActionResolved[][] = members.map(() => [])
      const dealt: CardsDealt[][] = members.map(() => [])
      for (const [index, { client }] of members.entries()) {
        await getSnapshot(client)
        client.on('robot.actionResolved', (action) => actions[index].push(action))
        client.on('cards.dealt', (hand) => dealt[index].push(hand))
      }
      const hands = members.map(({ client }) => new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve)))
      for (const [index, { client, joined }] of members.entries()) {
        const indices = index === 0 ? [2, 4, 5, 6, 8] : [4, 5, 6, 8, 3]
        expect(await client.timeout(1000).emitWithAck('program.submit', program(joined, indices)))
          .toEqual({ outcome: 'ACCEPTED' })
      }

      expect(await Promise.all(hands)).toEqual(members.map(({ joined }) => ({
        gameId: shared.gameId, playerId: joined.assignment.playerId, cards: joined.hand,
      })))
      expect(actions[0]).toHaveLength(15)
      expect(actions[1]).toEqual(actions[0])
      expect(actions[2]).toEqual(actions[0])
      expect(actions[0][0]).toEqual({
        gameId: shared.gameId, registerIndex: 0, robotId: robotIds[0], instruction: 'MOVE_3',
        pushedRobots: [],
        position: { coordinate: { x: 4, y: 3 }, orientation: 'NORTH' },
      })
      expect(actions[0].slice(0, 3).map((action) => action.robotId)).toEqual([robotIds[0], robotIds[2], robotIds[1]])
      expect(actions[0].slice(3, 6).map((action) => action.robotId)).toEqual([robotIds[2], robotIds[0], robotIds[1]])
      for (const [index, { client, joined }] of members.entries()) {
        const snapshot = await getSnapshot(client)
        expect(snapshot.outcome).toBe('JOINED')
        expect(snapshot.state.robots).toEqual(members.map(({ joined }) => ({
          robotId: joined.assignment.robotId, playerId: joined.assignment.playerId,
          colour: initializations[0].state.robots.find((robot) => robot.robotId === joined.assignment.robotId)!.colour,
          position: actions[0].findLast((action) => action.robotId === joined.assignment.robotId)!.position,
        })))
        expect(new Set(snapshot.state.robots.map(({ position }) =>
          `${position.coordinate.x},${position.coordinate.y}`)).size).toBe(3)
        expect(dealt[index]).toEqual([{
          gameId: shared.gameId, playerId: joined.assignment.playerId, cards: joined.hand,
        }])
      }
      expect(shared.game.board.occupantAt({ x: Integer(2), y: Integer(1) })).toBeUndefined()
    })
  })

})
