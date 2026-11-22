import { resolveRobotAction } from './activationTestHelper.js'
import { Integer } from '@/numbers'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { submitProgramSchema } from '@robo-rally/game-events'
import type { ClientToServerEvents, CardsDealt, GameWon, RobotActionResolved, GameInitialization, PlayerConnectionChanged, EnvironmentStepResolved, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { Game, type BoardMapName } from '@/game/index'
import { HAND_SIZE } from '@/game/Deck'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import * as gameContext from '@/socket/gameContext'
import { createSessionStore, type SessionStore } from '@/auth/sessionStore'
import { authCookieHeader } from './authTestHelper.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
describe('started game membership over Socket.IO', () => {
  let server: GameSocketServer
  let sessionStore: SessionStore
  let url: string
  let clients: Client[]
  let contexts: MockInstance<typeof gameContext.createGameContext>
  beforeEach(async () => {
    clients = []
    contexts = vi.spyOn(gameContext, 'createGameContext')
    await start()
  })
  async function start() {
    const http = createServer()
    sessionStore = createSessionStore({ oidcClient: { refreshToken: vi.fn() }, refreshBufferSeconds: 0 })
    server = createGameSocketServer(http, sessionStore)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  }
  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.restoreAllMocks()
  })
  function currentGame(): Game {
    const latest = contexts.mock.results.at(-1)
    if (!latest) throw new Error('No game has started yet')
    return (latest.value as ReturnType<typeof gameContext.createGameContext>).game
  }
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
  async function startGame(names: string[], mapName: BoardMapName = 'empty-map') {
    const members = await Promise.all(names.map(connect))
    const created = await members[0].emitWithAck('lobby.create', { mapName })
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    const { lobbyId } = created.lobby
    for (const member of members.slice(1)) await member.emitWithAck('lobby.join', { lobbyId })
    const ready = members.map((member) => new Promise<GameInitialization>((resolve) => member.once('game.started', ({ initialization }) => resolve(initialization))))
    expect((await members[0].emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    return { members, initializations: await Promise.all(ready) }
  }
  async function connectWithSessionId(username: string, expiresInSeconds = 3600): Promise<{ client: Client; sessionId: string }> {
    const sessionId = sessionStore.create(username, username, 'test-id-token', 'test-refresh-token', expiresInSeconds)
    const client: Client = io(url, {
      autoConnect: false, transports: ['websocket'], reconnection: false, ackTimeout: 1000,
      extraHeaders: { Cookie: `game_session=${sessionId}` },
    })
    clients.push(client)
    const connected = new Promise<void>((resolve) => client.once('connect', resolve))
    client.connect()
    await connected
    return { client, sessionId }
  }
  async function disconnect(client: Client, recoverable = false) {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    if (recoverable) client.io.engine.close()
    else client.disconnect()
    await closed
  }
  const submission = (initial: GameInitialization) => submitProgramSchema.parse({
    cardIds: initial.hand.slice(0, 5).map((card) => card.id),
  })
  // Deck.draw is fixed to always take the front of the pile (see test/setup.ts), so
  // the first card of every freshly dealt hand is deterministically a MOVE_1.
  function raw(client: Client, event: string, payload: unknown): Promise<unknown> {
    return (client.emitWithAck as (event: string, payload: unknown) => Promise<unknown>)(event, payload)
  }

  it('acknowledges fresh clock samples without game membership or broadcasts', async () => {
    const client = await connect('Dane')
    const broadcasts: string[] = []
    client.onAny((name) => broadcasts.push(name))
    expect(await raw(client, 'clock.get', { extra: true })).toEqual({ outcome: 'INVALID_REQUEST' })
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(await client.emitWithAck('clock.get', {})).toEqual({ outcome: 'CLOCK', serverTime: now })
    clock.mockReturnValue(now + 100)
    expect(await client.emitWithAck('clock.get', {})).toEqual({ outcome: 'CLOCK', serverTime: now + 100 })
    expect((await client.emitWithAck('session.get', {})).outcome).toBe('NO_SESSION')
    expect(broadcasts).toEqual([])
  })

  it('rejects malformed session requests and starts with no session', async () => {
    const client = await connect('Dane')
    expect(await raw(client, 'session.get', { gameId: 'irrelevant' })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION', user: { userId: 'Dane', username: 'Dane' } })
    expect(server.sockets.sockets.get(client.id!)!.rooms).toEqual(new Set([client.id]))
  })
  it('returns the same assignment and hand on repeated session discovery', async () => {
    const { members: [first], initializations: [initial] } = await startGame(['First', 'Second'])
    const repeated = await getSnapshot(first)
    expect(repeated).toEqual({ ...initial, state: { ...initial.state, serverTime: expect.any(Number) } })
    expect(currentGame().players).toHaveLength(2)
  })
  it('rejects nonmember and foreign-hand submissions', async () => {
    const { members: [first, second], initializations: [initial, other] } = await startGame(['First', 'Second'])
    const outsider = await connect('Outside')
    expect(await outsider.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await second.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect((await getSnapshot(first)).programSubmitted).toBe(true)
    expect((await getSnapshot(second)).hand).toEqual(other.hand)
  })
  it('revokes room access and frees occupancy when a member explicitly leaves', async () => {
    const { members: [first, second], initializations: [initial] } = await startGame(['First', 'Second'])
    const game = currentGame()
    const left = new Promise((resolve) => second.once('game.playerLeft', resolve))
    expect(await raw(first, 'game.leave', { extra: true })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await first.emitWithAck('game.leave', {})).toEqual({ outcome: 'LEFT' })
    expect(await left).toEqual({ gameId: game.id, playerId: initial.assignment.playerId, robotId: initial.assignment.robotId })
    expect(game.board.occupantAt({ x: Integer(10), y: Integer(7) })).toBeUndefined()
    expect(server.sockets.sockets.get(first.id!)!.rooms).toEqual(new Set([first.id]))
    expect(await first.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION', user: { userId: 'First', username: 'First' } })
    expect(await first.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
  })
  it('completes the programming barrier when an unsubmitted member leaves', async () => {
    const { members: [first, second], initializations: [initial] } = await startGame(['First', 'Second'])
    const game = currentGame()
    await first.emitWithAck('program.submit', submission(initial))
    const hand = new Promise<CardsDealt>((resolve) => first.once('cards.dealt', resolve))
    await second.emitWithAck('game.leave', {})
    const dealt = await hand
    expect(dealt).toMatchObject({ gameId: game.id, playerId: initial.assignment.playerId })
    expect(dealt.cards).toHaveLength(HAND_SIZE)
    expect(game.lastActivePhase).toBe('programming')
  })
  it('preserves assignments, hands and checkpoint progress while waiting for every disconnected member', async () => {
    const { members: [first, second, witness], initializations: [initial, other, observer] } = await startGame(['First', 'Second', 'Witness'])
    const game = currentGame()
    game.players[0].completeCheckpoint(1)
    const changed: PlayerConnectionChanged[] = []
    witness.on('game.playerConnectionChanged', (event) => changed.push(event))
    await disconnect(first)
    await disconnect(second)
    expect(game.paused).toBe(true)
    expect(await witness.emitWithAck('program.submit', submission(observer))).toEqual({ outcome: 'GAME_PAUSED' })
    const returnedFirst = await connect('First')
    const restoredFirst = await getSnapshot(returnedFirst)
    expect(restoredFirst.assignment).toEqual(initial.assignment)
    expect(restoredFirst.hand).toEqual(initial.hand)
    expect(restoredFirst.state.players[0].lastCheckpoint).toBe(1)
    expect(restoredFirst.state.paused).toBe(true)
    expect(await witness.emitWithAck('program.submit', submission(observer))).toEqual({ outcome: 'GAME_PAUSED' })
    const returnedSecond = await connect('Second')
    const restoredSecond = await getSnapshot(returnedSecond)
    expect(restoredSecond.assignment).toEqual(other.assignment)
    expect(restoredSecond.state.paused).toBe(false)
    await witness.emitWithAck('session.get', {})
    expect(changed.map((event) => [event.connected, event.paused])).toEqual([[false, true], [false, true], [true, true], [true, false]])
    expect(await witness.emitWithAck('program.submit', submission(observer))).toEqual({ outcome: 'ACCEPTED' })
  })
  it('skips an action queued before disconnect and executes it once after reconnect', async () => {
    const { members: [first, second] } = await startGame(['First', 'Second'])
    const game = currentGame()
    const ctx = contexts.mock.results.at(-1)!.value as ReturnType<typeof gameContext.createGameContext>
    for (const player of game.players) game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    for (let action = 0; action < 9; action++) resolveRobotAction(game)
    const execute = vi.spyOn(game, 'executeNextAction')
    const actions: unknown[] = []
    second.on('robot.actionResolved', (payload) => actions.push(payload))

    ctx.actionScheduler.scheduleNextAction()
    // Disconnect synchronously so the game pauses before the queued callback runs.
    server.sockets.sockets.get(first.id!)!.disconnect(true)
    expect(game.paused).toBe(true)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(execute).not.toHaveBeenCalled()
    expect(game.aborted).toBe(false)

    const hand = new Promise((resolve) => second.once('cards.dealt', resolve))
    await getSnapshot(await connect('First'))
    await hand
    expect(execute).toHaveBeenCalledOnce()
    expect(actions).toHaveLength(1)
    expect(game.lastActivePhase).toBe('programming')
    expect(game.paused).toBe(false)
  })
  it('recovers a game socket and resumes without client session discovery', async () => {
    const { members: [first, second] } = await startGame(['First', 'Second'])
    const game = currentGame()
    await disconnect(first, true)
    expect(game.paused).toBe(true)
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
    const game = currentGame()
    await disconnect(first, true)
    expect(game.paused).toBe(true)
    first.io.opts.extraHeaders = authCookieHeader(sessionStore, 'different-subject')
    const rejected = new Promise<Error>((resolve) => first.once('connect_error', resolve))
    first.connect()
    expect((await rejected).message).toBe('SESSION_MISMATCH')
    expect(game.paused).toBe(true)
  })
  it('rejects a recovery attempt and withholds buffered updates once the backing session was destroyed while disconnected', async () => {
    const { client: first, sessionId } = await connectWithSessionId('First')
    const second = await connect('Second')
    const created = await first.emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    await second.emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId })
    await disconnect(first, true)
    sessionStore.destroy(sessionId)
    const third = await connect('Third')
    await third.emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId })
    const rejected = new Promise<Error>((resolve) => first.once('connect_error', resolve))
    const receivedUpdate = vi.fn()
    first.once('lobby.updated', receivedUpdate)
    first.connect()
    expect((await rejected).message).toBe('UNAUTHENTICATED')
    expect(receivedUpdate).not.toHaveBeenCalled()
  })
  it('drops a still-connected member and withholds further broadcasts once their session is destroyed', async () => {
    const { client: first, sessionId } = await connectWithSessionId('First')
    const second = await connect('Second')
    const created = await second.emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    await first.emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId })
    sessionStore.destroy(sessionId)
    const firstReceivedStart = vi.fn()
    first.once('game.started', firstReceivedStart)
    const disconnected = new Promise<void>((resolve) => first.once('disconnect', () => resolve()))
    const started = new Promise((resolve) => second.once('game.started', resolve))
    expect((await second.emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    await started
    await disconnected
    expect(firstReceivedStart).not.toHaveBeenCalled()
  })
  it('rejects a command from a still-connected socket once its session is destroyed and disconnects it', async () => {
    const { client: first, sessionId } = await connectWithSessionId('First')
    sessionStore.destroy(sessionId)
    const disconnected = new Promise<void>((resolve) => first.once('disconnect', () => resolve()))
    await expect(first.timeout(500).emitWithAck('lobby.create', {})).rejects.toThrow()
    await disconnected
  })
  it('rejects a command from a still-connected socket once its session naturally expires and disconnects it', async () => {
    const { client: first, sessionId } = await connectWithSessionId('First', 0.05)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(sessionStore.get(sessionId)).toBeUndefined()
    const disconnected = new Promise<void>((resolve) => first.once('disconnect', () => resolve()))
    await expect(first.timeout(500).emitWithAck('lobby.create', {})).rejects.toThrow()
    await disconnected
  })
  it('drops a still-connected member and withholds further broadcasts once their session naturally expires', async () => {
    const { client: first, sessionId } = await connectWithSessionId('First', 0.05)
    const second = await connect('Second')
    const created = await second.emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    await first.emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(sessionStore.get(sessionId)).toBeUndefined()
    const firstReceivedStart = vi.fn()
    first.once('game.started', firstReceivedStart)
    const disconnected = new Promise<void>((resolve) => first.once('disconnect', () => resolve()))
    const started = new Promise((resolve) => second.once('game.started', resolve))
    expect((await second.emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    await started
    await disconnected
    expect(firstReceivedStart).not.toHaveBeenCalled()
  })
  it('keeps the game paused when a reconnect snapshot fails and permits retry', async () => {
    const { members: [first], initializations: [initial] } = await startGame(['First'])
    const game = currentGame()
    game.submitProgram(initial.assignment.playerId, submission(initial).cardIds)._unsafeUnwrap()
    await disconnect(first)
    const replacement = await connect('First')
    vi.spyOn(game.board, 'getTile').mockImplementationOnce(() => { throw new Error('Snapshot failed') })
    expect(await replacement.emitWithAck('session.get', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(game.paused).toBe(true)
    expect(server.sockets.sockets.get(replacement.id!)!.rooms).toEqual(new Set([replacement.id]))
    expect((await getSnapshot(replacement)).assignment).toEqual(initial.assignment)
    expect(game.paused).toBe(false)
  })
    it('announces the winner instead of dealing hands when a departure completes the final checkpoint', async () => {
    const { members, initializations } = await startGame(['First', 'Second'])
    const game = currentGame()
    for (const player of game.players) game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    // Priority order depends on card-driven positions, so whichever player's final
    // register is still pending after 9 of the 10 actions can vary between runs.
    let lastActedRobotId: string | undefined
    for (let action = 0; action < 9; action++) lastActedRobotId = resolveRobotAction(game).action.robotId
    const pendingPlayer = game.players.find((candidate) => candidate.robot.id !== lastActedRobotId)!
    const player = game.players.find((candidate) => candidate !== pendingPlayer)!
    const pendingIndex = initializations.findIndex((initial) => initial.assignment.playerId === pendingPlayer.id)
    const leaving = members[pendingIndex]
    const remaining = members[1 - pendingIndex]
    const remainingName = ['First', 'Second'][1 - pendingIndex]

    player.completeCheckpoint(1)
    // pendingPlayer is about to leave anyway; remove it first so it can never be
    // occupying (8,9) by coincidence of random movement during the 9 prior actions.
    game.board.removeRobot(pendingPlayer.robot.id)
    game.board.removeRobot(player.robot.id)
    game.board.placeRobot(player.robot.id, { x: Integer(8), y: Integer(9) })
    const events: string[] = []
    remaining.onAny((name) => { if (['game.playerLeft', 'environment.stepResolved', 'game.won', 'cards.dealt'].includes(name)) events.push(name) })
    const progress = new Promise<EnvironmentStepResolved>((resolve) => remaining.on('environment.stepResolved', (step) => {
      if (step.kind === 'CHECKPOINTS') resolve(step)
    }))
    const won = new Promise<GameWon>((resolve) => remaining.once('game.won', resolve))
    await leaving.emitWithAck('game.leave', {})
    expect((await progress).checkpointProgress).toEqual([{ playerId: player.id, lastCheckpoint: 2 }])
    expect(await won).toEqual({ gameId: game.id, playerId: player.id, username: remainingName })
    await getSnapshot(remaining)
    expect(events).toEqual(['game.playerLeft', 'environment.stepResolved', 'game.won'])
  })

  it('announces the winner after the final checkpoint and ends the game', async () => {
    const { members: [client], initializations: [initial] } = await startGame(['First'])
    const game = currentGame()
    const player = game.players[0]
    player.completeCheckpoint(1)
    game.board.relocateRobot(player.robot.id, { x: Integer(8), y: Integer(10) })
    const events: string[] = []
    client.onAny((name) => { if (name !== 'program.timerChanged') events.push(name) })
    const won = new Promise<GameWon>((resolve) => client.once('game.won', resolve))

    expect(await client.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })

    expect(await won).toEqual({ gameId: game.id, playerId: player.id, username: 'First' })
    const snapshot = await getSnapshot(client)
    expect(events).toEqual([
      'program.finalized', 'game.registersChanged', 'program.submitted',
      'robot.actionResolved', 'environment.stepResolved', 'game.won',
    ])
    expect(snapshot.state.winner).toEqual({ playerId: player.id, username: 'First' })
    expect(snapshot.state.phase).toBe('EXECUTING')
    expect(await client.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'GAME_FINISHED' })
  })

  it("keeps the winner's username in snapshots after the winner has left", async () => {
    const { members: [first, second], initializations } = await startGame(['First', 'Second'])
    const game = currentGame()
    const player = game.players[0]
    player.completeCheckpoint(1)
    game.board.relocateRobot(player.robot.id, { x: Integer(8), y: Integer(10) })
    const won = new Promise<GameWon>((resolve) => second.once('game.won', resolve))
    for (const [index, client] of [first, second].entries()) {
      expect(await client.emitWithAck('program.submit', submission(initializations[index]))).toEqual({ outcome: 'ACCEPTED' })
    }
    expect(await won).toEqual({ gameId: game.id, playerId: player.id, username: 'First' })
    await first.emitWithAck('game.leave', {})
    const snapshot = await getSnapshot(second)
    expect(snapshot.state.players.map(({ username }) => username)).toEqual(['Second'])
    expect(snapshot.state.winner).toEqual({ playerId: player.id, username: 'First' })
  })

  it('ignores commands without acknowledgements', async () => {
    const client = await connect('Abid')
    const emit = client.emit.bind(client) as (event: string, payload: unknown) => void
    emit('lobby.create', {})
    emit('program.submit', {})
    emit('game.updateRegisters', {})
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION', user: { userId: 'Abid', username: 'Abid' } })
    expect(contexts.mock.results).toHaveLength(0)
  })
  it('aborts the game permanently on an unexpected execution failure, still tells (re)joining members, and still allows leaving', async () => {
    const { members: [first, second], initializations: [initial, other] } = await startGame(['First', 'Second'])
    const game = currentGame()

    const aborted = new Promise((resolve) => first.once('game.aborted', resolve))
    vi.spyOn(game, 'executeNextAction').mockImplementationOnce(() => { throw new Error('boom') })
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    await second.timeout(1000).emitWithAck('program.submit', submission(other))
    await aborted

    expect(game.aborted).toBe(true)
    expect((await getSnapshot(first)).state.aborted).toBe(true)
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toMatchObject({ outcome: 'GAME_ABORTED' })
    expect(await first.timeout(1000).emitWithAck('game.leave', {}))
      .toEqual({ outcome: 'LEFT' })
  })

  describe('pit results over Socket.IO', () => {
    it('broadcasts a chain push and its rebooted robot to every client in one action', async () => {
      const { members: sockets, initializations } = await startGame(['Pusher', 'Pushed', 'Falling'], 'test-map')
      const members = sockets.map((client, index) => ({ client, joined: initializations[index] }))
      const game = currentGame()
      const robotIds = members.map(({ joined }) => joined.assignment.robotId)
      const column = 15
      const pitY = 9
      // Distance from the antenna (10,0) is monotonic in y for a fixed x, so the
      // topmost robot always has priority. The dealt MOVE_1 card moves it 1 step.
      game.board.relocateRobot(robotIds[0], { x: Integer(column), y: Integer(pitY - 3) })
      game.board.relocateRobot(robotIds[1], { x: Integer(column), y: Integer(pitY - 2) })
      game.board.relocateRobot(robotIds[2], { x: Integer(column), y: Integer(pitY - 1) })
      game.players[0].robot.turn(2) // NORTH -> SOUTH, facing the pit
      game.players[1].robot.turn(1) // NORTH -> WEST
      game.players[2].robot.turn(3) // NORTH -> EAST
      const actions: RobotActionResolved[][] = members.map(() => [])
      members.forEach(({ client }, index) => client.on('robot.actionResolved', (action) => actions[index].push(action)))
      const hands = members.map(({ client }) => new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve)))
      for (const { client, joined } of members) {
        expect(await client.timeout(1000).emitWithAck('program.submit', submission(joined))).toEqual({ outcome: 'ACCEPTED' })
      }
      await Promise.all(hands)

      expect(actions[0][0]).toEqual({
        gameId: game.id, registerIndex: 0, robotId: robotIds[0], instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1',
        playerId: initializations[0].assignment.playerId,
        position: { coordinate: { x: column, y: pitY - 2 }, orientation: 'SOUTH' },
        pushedRobots: [
          { robotId: robotIds[1], position: { coordinate: { x: column, y: pitY - 1 }, orientation: 'WEST' } },
          // (10,10) is the reboot tile closest to the pit at (15,9).
          { robotId: robotIds[2], position: { coordinate: { x: 10, y: 10 }, orientation: 'EAST' } },
        ],
        reboots: [{ robotId: robotIds[2], fellAt: { x: column, y: pitY }, landedAt: { x: 10, y: 10 } }],
      })
      expect(actions[0]).toHaveLength(15)
      expect(actions[1]).toEqual(actions[0])
      expect(actions[2]).toEqual(actions[0])
    })

    it('broadcasts rebooted positions before progress and hands and restores them on rejoining', async () => {
      const { members: [client], initializations: [initial] } = await startGame(['First'], 'test-map')
      expect(initial.state.board.tiles.find((tile) => tile.type === 'PIT'))
        .toEqual({ position: { x: 3, y: 3 }, type: 'PIT' })
      const game = currentGame()
      const outsider = await connect('Login only')
      const outsideEvents = vi.fn()
      outsider.onAny(outsideEvents)
      const actions: RobotActionResolved[] = []
      const progress: EnvironmentStepResolved[] = []
      const events: string[] = []
      // Rebooting next to a checkpoint can incidentally earn it on a later random register.
      client.onAny((name) => { if (name !== 'program.timerChanged' && name !== 'player.checkpointProgress') events.push(name) })
      client.on('robot.actionResolved', (action) => actions.push(action))
      client.on('environment.stepResolved', (payload) => progress.push(payload))
      const hand = new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve))

      const robotId = initial.assignment.robotId
      game.board.relocateRobot(robotId, { x: Integer(3), y: Integer(2) })
      game.players[0].robot.turn(2) // NORTH -> SOUTH, facing the pit

      expect(await client.timeout(1000).emitWithAck('program.submit', submission(initial)))
        .toEqual({ outcome: 'ACCEPTED' })
      const dealtHand = await hand
      expect(dealtHand).toMatchObject({ gameId: game.id, playerId: initial.assignment.playerId })
      expect(dealtHand.cards).toHaveLength(HAND_SIZE)
      expect(actions[0]).toEqual({
        gameId: game.id, registerIndex: 0, robotId, playerId: initial.assignment.playerId,
        pushedRobots: [], instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1',
        // (2,6) is the reboot tile closest to the pit at (3,3).
        position: { coordinate: { x: 2, y: 6 }, orientation: 'SOUTH' },
        reboots: [{ robotId, fellAt: { x: 3, y: 3 }, landedAt: { x: 2, y: 6 } }],
      })
      expect(actions).toEqual([
        { coordinate: { x: 2, y: 6 }, orientation: 'SOUTH' },
        { coordinate: { x: 2, y: 7 }, orientation: 'SOUTH' },
        { coordinate: { x: 2, y: 8 }, orientation: 'SOUTH' },
        { coordinate: { x: 2, y: 9 }, orientation: 'SOUTH' },
        { coordinate: { x: 2, y: 11 }, orientation: 'SOUTH' },
      ].map((position, registerIndex) => {
        const instruction = initial.hand[registerIndex].instruction
        return {
          gameId: game.id, registerIndex, robotId: initial.assignment.robotId,
          playerId: initial.assignment.playerId,
          pushedRobots: [],
          // Only the first register falls into the pit at (3,3).
          reboots: registerIndex === 0
            ? [{ robotId: initial.assignment.robotId, fellAt: { x: 3, y: 3 }, landedAt: { x: 2, y: 6 } }] : [],
          instruction, resolvedInstruction: instruction, position,
        }
      }))
      expect(progress.flatMap((step) => step.checkpointProgress ?? [])).toEqual([])
      expect(events).toEqual([
        'program.finalized', 'game.registersChanged', 'program.submitted',
        ...Array.from({ length: 5 }, () => 'robot.actionResolved'), 'cards.dealt',
      ])
      const snapshot = await getSnapshot(client)
      expect(snapshot.outcome).toBe('JOINED')
      expect(snapshot.state.phase).toBe('PROGRAMMING')
      expect(snapshot.state.robots).toEqual([{
        robotId: initial.assignment.robotId, playerId: initial.assignment.playerId,
        robotSpriteId: initial.state.robots[0].robotSpriteId,
        colour: initial.state.robots[0].colour,
        position: actions[4].position,
      }])
      expect(game.board.occupantAt({ x: Integer(3), y: Integer(3) })).toBeUndefined()
      await outsider.timeout(1000).emitWithAck('session.get', {})
      expect(outsideEvents).not.toHaveBeenCalled()

      await disconnect(client)
      const restored = await getSnapshot(await connect('First'))
      expect(restored.assignment).toEqual(initial.assignment)
      expect(restored.hand).toHaveLength(HAND_SIZE)
      expect(restored.state.robots).toEqual(snapshot.state.robots)
      expect(restored.state.paused).toBe(false)
    })

    it('broadcasts the next closest reboot tile to every member when the closest one is taken', async () => {
      const { members: sockets, initializations } = await startGame(['First', 'Second', 'Third'], 'test-map')
      const members = sockets.map((client, index) => ({ client, joined: initializations[index] }))
      const game = currentGame()
      const robotIds = members.map(({ joined }) => joined.assignment.robotId)
      // Occupy (2,6), the reboot tile closest to the pit at (3,3), so the falling
      // robot must use the next closest one.
      game.board.relocateRobot(robotIds[1], { x: Integer(2), y: Integer(6) })
      // (3,2) keeps robot0 strictly closer to the antenna (10,0) than the occupied
      // reboot tile (distance 14), so it always has priority. The dealt MOVE_1 moves it 1 step.
      game.board.relocateRobot(robotIds[0], { x: Integer(3), y: Integer(2) })
      game.players[0].robot.turn(2) // NORTH -> SOUTH, facing the pit
      // (10,13) is 13 from the antenna, so robot2 acts between robot0 (9) and robot1 (14).
      game.board.relocateRobot(robotIds[2], { x: Integer(10), y: Integer(13) })
      const actions: RobotActionResolved[][] = members.map(() => [])
      const dealt: CardsDealt[][] = members.map(() => [])
      for (const [index, { client }] of members.entries()) {
        await getSnapshot(client)
        client.on('robot.actionResolved', (action) => actions[index].push(action))
        client.on('cards.dealt', (hand) => dealt[index].push(hand))
      }
      const hands = members.map(({ client }) => new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve)))
      for (const { client, joined } of members) {
        expect(await client.timeout(1000).emitWithAck('program.submit', submission(joined))).toEqual({ outcome: 'ACCEPTED' })
      }

      const dealtHands = await Promise.all(hands)
      for (const [index, { joined }] of members.entries()) {
        expect(dealtHands[index]).toMatchObject({ gameId: game.id, playerId: joined.assignment.playerId })
        expect(dealtHands[index].cards).toHaveLength(HAND_SIZE)
      }
      expect(actions[0]).toHaveLength(15)
      expect(actions[1]).toEqual(actions[0])
      expect(actions[2]).toEqual(actions[0])
      // (2,6) is occupied. (13,2) and (2,13) are next, both 11 away; (13,2) wins the tie
      // because it comes first in reading order.
      expect(actions[0][0]).toEqual({
        gameId: game.id, registerIndex: 0, robotId: robotIds[0], instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1',
        playerId: initializations[0].assignment.playerId,
        pushedRobots: [],
        position: { coordinate: { x: 13, y: 2 }, orientation: 'SOUTH' },
        reboots: [{ robotId: robotIds[0], fellAt: { x: 3, y: 3 }, landedAt: { x: 13, y: 2 } }],
      })
      expect(game.board.occupantAt({ x: Integer(3), y: Integer(3) })).toBeUndefined()
      expect(game.board.positionOf(robotIds[1])).not.toEqual({ x: 13, y: 2 })
      expect(actions[0].slice(0, 3).map((action) => action.robotId)).toEqual([robotIds[0], robotIds[2], robotIds[1]])
      expect(actions[0].slice(3, 6).map((action) => action.robotId)).toEqual([robotIds[0], robotIds[2], robotIds[1]])
      for (const [index, { client, joined }] of members.entries()) {
        const snapshot = await getSnapshot(client)
        expect(snapshot.outcome).toBe('JOINED')
        // After game execution, verify that each robot has moved from its initial position
        // The specific final position depends on movement interactions, so we just check the robotId matches
        expect(snapshot.state.robots.map((robot) => robot.robotId).sort()).toEqual(
          members.map(({ joined }) => joined.assignment.robotId).sort()
        )
        expect(new Set(snapshot.state.robots.map(({ position }) =>
          `${position.coordinate.x},${position.coordinate.y}`)).size).toBe(3)
        expect(dealt[index]).toEqual([{
          gameId: game.id, playerId: joined.assignment.playerId, cards: expect.arrayContaining([...dealtHands[index].cards]),
        }])
      }
    })
  })
})
