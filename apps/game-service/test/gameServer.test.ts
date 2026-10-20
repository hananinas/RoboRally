import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseSubmitProgram } from '@robo-rally/game-events'
import type {
  ClientToServerEvents, JoinResult, LobbyDetails, PlayerConnectionChanged, PlayerCheckpointProgress, ServerToClientEvents,
  CardsDealt, PublicGameStateResult, RobotActionResolved,
} from '@robo-rally/game-events'
import { io as createClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Board, EmptyTile, PitTile, Game, Card } from '@/game/index.ts'
import { createHand, createSharedGame } from '@/game/SinglePlayerGame.ts'
import { createGameSocketServer, type GameSocketServer } from '@/gameServer.ts'
import * as gamePresenter from '@/gamePresenter.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
type Joined = Extract<JoinResult, { outcome: 'JOINED' }>

describe('game membership over Socket.IO', () => {
  let server: GameSocketServer
  let shared: ReturnType<typeof createSharedGame>
  let url: string
  let clients: Client[]

  beforeEach(async () => {
    shared = createSharedGame()
    clients = []
    await start()
  })

  async function start() {
    const http = createServer()
    server = createGameSocketServer(http, shared)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  }

  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function connect(
    username?: string,
    options?: Partial<Parameters<typeof createClient>[1]>,
  ): Promise<Client> {
    const client: Client = createClient(url, {
      autoConnect: false, transports: ['websocket'], reconnection: false, ...options,
    })
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
      client.connect()
    })
    if (username !== undefined) await client.timeout(1000).emitWithAck('user.login', { username })
    return client
  }

  async function join(client: Client): Promise<Joined> {
    const result = await client.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId })
    expect(result.outcome).toBe('JOINED')
    if (result.outcome !== 'JOINED') throw new Error(result.outcome)
    return result
  }

  async function disconnectClient(client: Client): Promise<void> {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    client.disconnect()
    await closed
  }

  async function disconnectClientRecoverably(client: Client): Promise<void> {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    client.io.engine.close()
    await closed
  }

  function waitForConnectionChanges(client: Client, count: number) {
    return new Promise<PlayerConnectionChanged[]>((resolve) => {
      const seen: PlayerConnectionChanged[] = []
      client.on('game.playerConnectionChanged', (payload) => {
        seen.push(payload)
        if (seen.length === count) resolve(seen)
      })
    })
  }

  function raw(client: Client, event: string, payload: unknown): Promise<unknown> {
    const emit = client.emit.bind(client) as unknown as
      (event: string, payload: unknown, acknowledge: (result: unknown) => void) => void
    return new Promise((resolve) => emit(event, payload, resolve))
  }

  function submission(joined: Joined) {
    return parseSubmitProgram({ gameId: shared.gameId, playerId: joined.assignment.playerId, cardIds: joined.hand.slice(0, 5).map((card) => card.id) })
  }

  it('keeps connection and login separate from rooms, hands and membership', async () => {
    const client = await connect()
    const received = vi.fn()
    client.onAny(received)
    expect(await client.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'LOGIN_REQUIRED' })
    const login = await client.timeout(1000).emitWithAck('user.login', { username: 'Dane' })
    expect(login.outcome).toBe('LOGGED_IN')
    expect(await client.timeout(1000).emitWithAck('user.login', { username: 'Dane' })).toEqual(login)
    expect(await client.timeout(1000).emitWithAck('user.login', { username: 'Other' }))
      .toEqual({ outcome: 'ALREADY_LOGGED_IN' })
    expect(await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId }))
      .toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(shared.game.players).toEqual([])
    expect(server.sockets.sockets.get(client.id!)?.rooms).toEqual(new Set([client.id]))
    expect(received).not.toHaveBeenCalled()
  })

  it('rejects malformed login without binding identity', async () => {
    const client = await connect()
    expect(await raw(client, 'user.login', null)).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw(client, 'user.login', { username: '' })).toEqual({ outcome: 'INVALID_USERNAME' })
    expect(server.sockets.sockets.get(client.id!)?.data.user).toBeUndefined()
  })

  it('assigns distinct players and private hands and notifies existing members', async () => {
    const first = await connect('First')
    const initial = await join(first)
    expect(initial.hand).toHaveLength(9)
    expect(initial.state.robots[0].position.coordinate).toEqual({ x: 10, y: 7 })
    const second = await connect('Second')
    const notification = new Promise((resolve) => first.once('game.playerJoined', resolve))
    const result = await join(second)
    expect(result.assignment.playerId).not.toBe(initial.assignment.playerId)
    expect(result.assignment.robotId).not.toBe(initial.assignment.robotId)
    expect(result.state.robots.map((robot) => robot.position.coordinate)).toEqual([{ x: 10, y: 7 }, { x: 9, y: 7 }])
    expect(result.hand.every((card) => !initial.hand.some((other) => other.id === card.id))).toBe(true)
    expect(result.state.players?.map((player) => player.username)).toEqual(['First', 'Second'])
    expect(await notification).toEqual({ gameId: shared.gameId, player: result.state.players![1], robot: result.state.robots[1] })
    expect(server.sockets.sockets.get(second.id!)?.rooms).toEqual(new Set([
      second.id, `game:${shared.gameId}:public`, `game:${shared.gameId}:player:${result.assignment.playerId}`,
    ]))
  })

  it('returns fresh state on duplicate joins without dealing or announcing another player', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    await join(second)
    const announced = vi.fn()
    second.on('game.playerJoined', announced)
    const repeated = await join(first)
    expect(repeated.assignment).toEqual(initial.assignment)
    expect(repeated.hand).toEqual(initial.hand)
    expect(repeated.state.robots).toHaveLength(2)
    expect(shared.game.players).toHaveLength(2)
    expect(announced).not.toHaveBeenCalled()
  })

  it('atomically accepts only one of two connections using the same user', async () => {
    const first = await connect('Same')
    const second = await connect('Same')
    const results = await Promise.all([first, second].map((client) =>
      client.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId })))
    expect(results.map((result) => result.outcome).sort((a, b) => a.localeCompare(b))).toEqual(['JOINED', 'USER_ALREADY_IN_GAME'])
    expect(shared.game.players).toHaveLength(1)
    const loser = results[0].outcome === 'JOINED' ? second : first
    expect(await loser.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId }))
      .toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(server.sockets.sockets.get(loser.id!)?.rooms).toEqual(new Set([loser.id]))
  })

  it('rejects malformed and unavailable joins without partial membership', async () => {
    const client = await connect('First')
    expect(await raw(client, 'game.join', { gameId: shared.gameId, extra: true }))
      .toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await client.timeout(1000).emitWithAck('game.join', { gameId: '00000000-0000-4000-8000-000000000999' }))
      .toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(shared.game.players).toEqual([])
    expect(server.sockets.sockets.get(client.id!)?.rooms).toEqual(new Set([client.id]))
  })

  it('rejects exhausted spawns without leaving a membership or room', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    shared = { gameId: shared.gameId, game: new Game(new Board([[new EmptyTile()]]), [],
      Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'MOVE_1'))) }
    await start()
    await join(await connect('First'))
    const second = await connect('Second')
    expect(await second.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'NO_SPAWN_AVAILABLE' })
    expect(shared.game.players).toHaveLength(1)
    expect(server.sockets.sockets.get(second.id!)?.rooms).toEqual(new Set([second.id]))
  })

  it('rolls back a failed join snapshot before granting room access', async () => {
    const client = await connect('First')
    const removed = vi.spyOn(shared.game, 'removePlayer')
    const snapshot = vi.spyOn(gamePresenter, 'presentPublicGameState')
      .mockImplementationOnce(() => { throw new Error('Presentation failed') })
    expect(await client.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'INTERNAL_ERROR' })
    snapshot.mockRestore()
    expect(removed).toHaveBeenCalledTimes(1)
    expect(shared.game.players).toEqual([])
    expect(shared.game.board.occupantAt({ x: 10, y: 7 })).toBeUndefined()
    expect(server.sockets.sockets.get(client.id!)?.rooms).toEqual(new Set([client.id]))
    const retried = await join(client)
    expect(retried.assignment.playerId).not.toBe(removed.mock.calls[0][0])
    expect(retried.state.robots).toHaveLength(1)
  })

  it('rejects nonmember and foreign-hand submissions and reports accepted programs', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    const other = await join(second)
    const outsider = await connect('Outside')
    expect(await outsider.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await second.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.timeout(1000).emitWithAck('program.submit', {
      ...submission(initial), playerId: other.assignment.playerId,
    })).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect(shared.game.hasSubmittedProgram(initial.assignment.playerId)).toBe(true)
    expect((await join(first)).programSubmitted).toBe(true)
    expect((await join(second)).hand).toEqual(other.hand)
  })

  it('closes new joins permanently on the first accepted program, not an invalid request', async () => {
    const first = await connect('First')
    const initial = await join(first)
    expect(await raw(first, 'program.submit', { ...submission(initial), cardIds: [] })).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(shared.game.hasStarted).toBe(false)
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect(shared.game.hasStarted).toBe(true)
    const late = await connect('Late')
    expect(await late.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'GAME_ALREADY_STARTED' })
    expect((await join(first)).assignment).toEqual(initial.assignment)
    await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })
    expect(shared.game.players).toEqual([])
    expect(await first.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'GAME_ALREADY_STARTED' })
  })

  it('keeps private next-round hands away from other members and login-only sockets', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    const other = await join(second)
    const outsider = await connect('Outside')
    const outsideEvents = vi.fn()
    outsider.onAny(outsideEvents)
    const firstHand = new Promise((resolve) => first.once('cards.dealt', resolve))
    const secondHand = new Promise((resolve) => second.once('cards.dealt', resolve))
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    await second.timeout(1000).emitWithAck('program.submit', submission(other))
    expect(await firstHand).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand })
    expect(await secondHand).toEqual({ gameId: shared.gameId, playerId: other.assignment.playerId, cards: other.hand })
    await outsider.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
    expect(outsideEvents).not.toHaveBeenCalled()
  })

  it('leaves without logging out, releases occupancy, and permits a fresh join before starting', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    await join(second)
    const left = new Promise((resolve) => second.once('game.playerLeft', resolve))
    expect(await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'LEFT' })
    expect(await left).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, robotId: initial.assignment.robotId })
    expect(shared.game.board.occupantAt({ x: 10, y: 7 })).toBeUndefined()
    expect(server.sockets.sockets.get(first.id!)?.data.user?.username).toBe('First')
    expect(server.sockets.sockets.get(first.id!)?.rooms).toEqual(new Set([first.id]))
    expect(await first.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    const fresh = await join(first)
    expect(fresh.assignment.playerId).not.toBe(initial.assignment.playerId)
    expect(fresh.state.robots.at(-1)?.position.coordinate).toEqual({ x: 10, y: 7 })
  })

  it('rechecks the existing submission barrier when an unsubmitted member leaves', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    await join(second)
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))
    await second.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })
    expect(await hand).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand })
    expect(shared.game.phase).toBe('programming')
  })

  it('broadcasts changed progress to members after actions and before next hands, without repeating it', async () => {
    const first = await connect('First')
    const initial = await join(first)
    expect(initial.state.checkpointCount).toBe(2)
    expect(initial.state.players[0].lastCheckpoint).toBe(0)
    const joinedEvent = new Promise((resolve) => first.once('game.playerJoined', resolve))
    const second = await connect('Second')
    const other = await join(second)
    expect(await joinedEvent).toMatchObject({ player: { playerId: other.assignment.playerId, lastCheckpoint: 0 } })
    const spectator = await connect('Login only')
    const spectatorProgress = vi.fn()
    spectator.on('player.checkpointProgress', spectatorProgress)

    // Turn right, move, turn left, move, U-turn: reach checkpoint 1 in register 4.
    const otherProgram = parseSubmitProgram({
      ...submission(other),
      cardIds: [5, 0, 4, 7, 6].map((index) => other.hand[index].id),
    })
    const seen: { name: string; payload: unknown }[][] = [[], []]
    for (const [index, client] of [first, second].entries()) {
      client.onAny((name, payload: unknown) => {
        if (['robot.actionResolved', 'player.checkpointProgress', 'cards.dealt'].includes(name)) {
          seen[index].push({ name, payload })
        }
      })
    }
    for (const round of [1, 2]) {
      const hands = [first, second].map((client) => new Promise((resolve) => client.once('cards.dealt', resolve)))
      await first.timeout(1000).emitWithAck('program.submit', submission(initial))
      await second.timeout(1000).emitWithAck('program.submit', otherProgram)
      await Promise.all(hands)
      for (const events of seen) {
        const actions = Array.from({ length: 10 }, () => 'robot.actionResolved')
        expect(events.map((event) => event.name)).toEqual(round === 1
          ? [
            ...actions.slice(0, 2), 'player.checkpointProgress',
            ...actions.slice(2, 8), 'player.checkpointProgress',
            ...actions.slice(8), 'cards.dealt',
          ]
          : [...actions, 'cards.dealt'])
        if (round === 1) expect(events.filter((event) => event.name === 'player.checkpointProgress').map((event) => event.payload))
          .toEqual(shared.game.players.map((player) => ({
            gameId: shared.gameId, playerId: player.id, lastCheckpoint: 1, checkpointCount: 2,
          })))
        events.length = 0
      }
    }
    expect((await join(first)).state.players.map((player) => player.lastCheckpoint)).toEqual([1, 1])
    await spectator.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
    expect(spectatorProgress).not.toHaveBeenCalled()
  })

  it('retains disconnected membership, robot, hand and checkpoint progress for the returning user', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const player = shared.game.players[0]
    player.completeCheckpoint(1)
    const disconnected = new Promise((resolve) => server.sockets.sockets.get(first.id!)!.once('disconnect', resolve))
    first.disconnect()
    await disconnected
    expect(shared.game.players).toHaveLength(1)
    const replacement = await connect('First')
    const restored = await join(replacement)
    expect(restored.assignment).toEqual(initial.assignment)
    expect(restored.hand).toEqual(initial.hand)
    expect(shared.game.players[0]).toBe(player)
    expect(player.lastCheckpoint).toBe(1)
    expect(restored.state.checkpointCount).toBe(2)
    expect(restored.state.players[0].lastCheckpoint).toBe(1)
  })

  it('pauses the game and announces disconnection when a member drops', async () => {
    const disconnectingSocket = await connect('A')
    const disconnectingPlayer = await join(disconnectingSocket)
    const otherSocket = await connect('B')
    await join(otherSocket)

    const connectionChanged = new Promise((resolve) => otherSocket.once('game.playerConnectionChanged', resolve))
    await disconnectClient(disconnectingSocket)

    expect(await connectionChanged).toEqual({
      gameId: shared.gameId, playerId: disconnectingPlayer.assignment.playerId, connected: false, paused: true,
    })
    expect(shared.game.paused).toBe(true)
    expect(await otherSocket.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId }))
      .toMatchObject({ outcome: 'GAME_FOUND', state: { paused: true } })
  })

  it('rejects program submissions while paused', async () => {
    const disconnectingSocket = await connect('A')
    await join(disconnectingSocket)
    const otherSocket = await connect('B')
    const otherPlayer = await join(otherSocket)

    await disconnectClient(disconnectingSocket)

    expect(await otherSocket.timeout(1000).emitWithAck('program.submit', submission(otherPlayer)))
      .toEqual({ outcome: 'GAME_PAUSED' })
    expect(shared.game.hasSubmittedProgram(otherPlayer.assignment.playerId)).toBe(false)
  })

  it('stays paused while another member remains disconnected', async () => {
    const firstDisconnectingSocket = await connect('A')
    await join(firstDisconnectingSocket)
    const secondDisconnectingSocket = await connect('B')
    await join(secondDisconnectingSocket)
    const otherSocket = await connect('C')
    await join(otherSocket)

    const connectionChanges = waitForConnectionChanges(otherSocket, 3)
    await disconnectClient(firstDisconnectingSocket)
    await disconnectClient(secondDisconnectingSocket)
    expect(shared.game.paused).toBe(true)

    await join(await connect('A'))

    expect((await connectionChanges).at(-1)).toMatchObject({ connected: true, paused: true })
    expect(shared.game.paused).toBe(true)
  })

  it('resumes and accepts submissions again once every member reconnects', async () => {
    const disconnectingSocket = await connect('A')
    const disconnectingPlayer = await join(disconnectingSocket)
    const otherSocket = await connect('B')
    const otherPlayer = await join(otherSocket)

    const connectionChanges = waitForConnectionChanges(otherSocket, 2)
    await disconnectClient(disconnectingSocket)
    expect(shared.game.paused).toBe(true)

    const replacement = await connect('A')
    const restored = await join(replacement)

    expect((await connectionChanges).at(-1)).toEqual({
      gameId: shared.gameId, playerId: disconnectingPlayer.assignment.playerId, connected: true, paused: false,
    })
    expect(shared.game.paused).toBe(false)

    expect(await replacement.timeout(1000).emitWithAck('program.submit', submission(restored)))
      .toEqual({ outcome: 'ACCEPTED' })
    expect(await otherSocket.timeout(1000).emitWithAck('program.submit', submission(otherPlayer)))
      .toEqual({ outcome: 'ACCEPTED' })
    expect(shared.game.hasStarted).toBe(true)
  })

  it('resumes mid-activation execution after the last disconnected member reconnects', async () => {
    const disconnectingSocket = await connect('A')
    await join(disconnectingSocket)
    const otherSocket = await connect('B')
    await join(otherSocket)
    for (const player of shared.game.players) {
      shared.game.submitProgram(player.id, player.hand.slice(0, 5))
    }
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    expect(shared.game.currentRegister).toBe(4)

    await disconnectClient(disconnectingSocket)
    expect(shared.game.paused).toBe(true)

    const resolvedActions: unknown[] = []
    otherSocket.on('robot.actionResolved', (payload) => resolvedActions.push(payload))
    const hand = new Promise((resolve) => otherSocket.once('cards.dealt', resolve))

    await join(await connect('A'))
    await hand

    expect(resolvedActions).toHaveLength(1)
    expect(shared.game.phase).toBe('programming')
    expect(shared.game.paused).toBe(false)
  })

  it('automatically reattaches and resumes a recovered connection without resending game.join', async () => {
    const disconnectingSocket = await connect('A', { reconnection: true })
    const disconnectingPlayer = await join(disconnectingSocket)
    const otherSocket = await connect('B')
    const otherJoined = new Promise((resolve) => disconnectingSocket.once('game.playerJoined', resolve))
    await join(otherSocket)
    // Recovery needs an offset to resume from; this primes it before disconnecting.
    await otherJoined

    const connectionChanges = waitForConnectionChanges(otherSocket, 2)
    await disconnectClientRecoverably(disconnectingSocket)
    expect(shared.game.paused).toBe(true)

    const reconnected = new Promise<void>((resolve) => disconnectingSocket.once('connect', resolve))
    await reconnected

    expect(disconnectingSocket.recovered).toBe(true)
    expect((await connectionChanges).at(-1)).toEqual({
      gameId: shared.gameId, playerId: disconnectingPlayer.assignment.playerId, connected: true, paused: false,
    })
    expect(shared.game.paused).toBe(false)
  })

  it('rejects a stale recovered connection when another connection already owns the membership', async () => {
    const staleSocket = await connect('A', { reconnection: true })
    const stalePlayer = await join(staleSocket)
    const bystander = await connect('Bystander')
    const bystanderJoined = new Promise((resolve) => staleSocket.once('game.playerJoined', resolve))
    await join(bystander)
    await bystanderJoined

    await disconnectClientRecoverably(staleSocket)
    expect(shared.game.paused).toBe(true)

    const newSocket = await connect('A')
    const restored = await join(newSocket)
    expect(restored.assignment).toEqual(stalePlayer.assignment)

    const staleRejected = new Promise<Error>((resolve) => staleSocket.once('connect_error', resolve))
    expect((await staleRejected).message).toBe('USER_ALREADY_IN_GAME')

    expect(await newSocket.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId }))
      .toMatchObject({ outcome: 'GAME_FOUND' })
  })

  it('deals the remaining player a hand when leaving completes the final register', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    await join(second)
    for (const player of shared.game.players) {
      shared.game.submitProgram(player.id, player.hand.slice(0, 5))
    }
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    expect(shared.game.currentRegister).toBe(4)
    const player = shared.game.players[0]
    expect(player.lastCheckpoint).toBe(1)
    shared.game.board.removeRobot(player.robot.id)
    shared.game.board.placeRobot(player.robot.id, { x: 8, y: 9 })
    const events: string[] = []
    first.onAny((name) => {
      if (['game.playerLeft', 'player.checkpointProgress', 'cards.dealt'].includes(name)) events.push(name)
    })
    const progress = new Promise<PlayerCheckpointProgress>((resolve) => first.once('player.checkpointProgress', resolve))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))

    expect(await second.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId }))
      .toEqual({ outcome: 'LEFT' })

    expect(await hand).toEqual({
      gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand,
    })
    expect(await progress).toEqual({
      gameId: shared.gameId, playerId: player.id, lastCheckpoint: 2, checkpointCount: 2,
    })
    expect(events).toEqual(['game.playerLeft', 'player.checkpointProgress', 'cards.dealt'])
    expect(shared.game.phase).toBe('programming')
  })

  it('ignores commands without acknowledgements without creating state', async () => {
    const client = await connect()
    const emit = client.emit.bind(client) as unknown as (event: string, payload: unknown) => void
    emit('user.login', { username: 'First' })
    emit('game.join', { gameId: shared.gameId })
    emit('game.leave', { gameId: shared.gameId })
    emit('program.submit', {})
    expect(await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId }))
      .toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(shared.game.players).toHaveLength(0)
    expect(server.sockets.sockets.get(client.id!)?.data.user).toBeUndefined()
  })

  describe('pit results over Socket.IO', () => {
    beforeEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      const tiles = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
      tiles[1][2] = new PitTile()
      tiles[4][4] = new EmptyTile([], 1)
      tiles[4][0] = new EmptyTile([], 2)
      shared = {
        gameId: shared.gameId,
        game: new Game(new Board(tiles), [], createHand(), undefined, undefined, { x: 4, y: 4 }),
      }
      await start()
    })

    function program(joined: Joined, indices: readonly number[]) {
      return parseSubmitProgram({
        gameId: shared.gameId, playerId: joined.assignment.playerId,
        cardIds: indices.map((index) => joined.hand[index].id),
      })
    }

    it('broadcasts rebooted positions before progress and hands and restores them on rejoining', async () => {
      const client = await connect('First')
      const initial = await join(client)
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
        instruction: initial.hand[[2, 0, 4, 5, 3][registerIndex]].instruction, position,
      })))
      expect(progress).toEqual([{
        gameId: shared.gameId, playerId: initial.assignment.playerId, lastCheckpoint: 1, checkpointCount: 2,
      }])
      expect(events).toEqual([
        'robot.actionResolved', 'player.checkpointProgress',
        ...Array.from({ length: 4 }, () => 'robot.actionResolved'), 'cards.dealt',
      ])
      const snapshot: PublicGameStateResult = await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
      expect(snapshot.outcome).toBe('GAME_FOUND')
      if (snapshot.outcome !== 'GAME_FOUND') throw new Error(snapshot.outcome)
      expect(snapshot.state.phase).toBe('PROGRAMMING')
      expect(snapshot.state.robots).toEqual([{
        robotId: initial.assignment.robotId, playerId: initial.assignment.playerId,
        position: actions[4].position,
      }])
      expect(snapshot.state.players[0].lastCheckpoint).toBe(1)
      expect(shared.game.board.occupantAt({ x: 2, y: 1 })).toBeUndefined()
      await outsider.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
      expect(outsideEvents).not.toHaveBeenCalled()

      await disconnectClient(client)
      const restored = await join(await connect('First'))
      expect(restored.assignment).toEqual(initial.assignment)
      expect(restored.hand).toEqual(initial.hand)
      expect(restored.state.robots).toEqual(snapshot.state.robots)
      expect(restored.state.players[0].lastCheckpoint).toBe(1)
      expect(restored.state.paused).toBe(false)
    })

    it('broadcasts the occupied-tile fallback to every member and uses its position for later priority', async () => {
      const members: { client: Client; joined: Joined }[] = []
      for (const username of ['First', 'Second', 'Third']) {
        const client = await connect(username)
        members.push({ client, joined: await join(client) })
      }
      const robotIds = members.map(({ joined }) => joined.assignment.robotId)
      shared.game.board.relocateRobot(robotIds[1], { x: 4, y: 4 })
      const actions: RobotActionResolved[][] = members.map(() => [])
      const dealt: CardsDealt[][] = members.map(() => [])
      for (const [index, { client }] of members.entries()) {
        await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
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
        position: { coordinate: { x: 4, y: 3 }, orientation: 'NORTH' },
      })
      expect(actions[0].slice(0, 3).map((action) => action.robotId)).toEqual([robotIds[0], robotIds[2], robotIds[1]])
      expect(actions[0].slice(3, 6).map((action) => action.robotId)).toEqual([robotIds[2], robotIds[0], robotIds[1]])
      for (const [index, { client, joined }] of members.entries()) {
        const snapshot: PublicGameStateResult = await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
        expect(snapshot.outcome).toBe('GAME_FOUND')
        if (snapshot.outcome !== 'GAME_FOUND') throw new Error(snapshot.outcome)
        expect(snapshot.state.robots).toEqual(members.map(({ joined }) => ({
          robotId: joined.assignment.robotId, playerId: joined.assignment.playerId,
          position: actions[0].findLast((action) => action.robotId === joined.assignment.robotId)!.position,
        })))
        expect(new Set(snapshot.state.robots.map(({ position }) =>
          `${position.coordinate.x},${position.coordinate.y}`)).size).toBe(3)
        expect(dealt[index]).toEqual([{
          gameId: shared.gameId, playerId: joined.assignment.playerId, cards: joined.hand,
        }])
      }
      expect(shared.game.board.occupantAt({ x: 2, y: 1 })).toBeUndefined()
    })
  })

  describe('game.getLobbyDetails', () => {
    const lobbies = async (client: Client) => {
      const result = await client.timeout(1000).emitWithAck('game.getLobbyDetails', {})
      return result.outcome === 'LOBBY_FOUND' ? result.lobbies : result
    }
    const demoMap = { name: 'DEMO MAP', icon: expect.stringMatching(/^data:image\/svg\+xml;base64,/), maxPlayers: 6 }
    const usernames = async (client: Client) => {
      const [lobby] = await lobbies(client) as readonly LobbyDetails[]
      return lobby!.players.map((player) => player.username)
    }

    it('rejects unauthenticated and malformed requests', async () => {
      const anonymous = await connect()
      expect(await lobbies(anonymous)).toEqual({ outcome: 'LOGIN_REQUIRED' })
      const client = await connect('Reader')
      expect(await raw(client, 'game.getLobbyDetails', { gameId: shared.gameId }))
        .toEqual({ outcome: 'INVALID_REQUEST' })
      expect(await raw(client, 'game.getLobbyDetails', null)).toEqual({ outcome: 'INVALID_REQUEST' })
    })

    it('lists the lobbies with their players and map without creating membership or room access', async () => {
      const reader = await connect('Reader')
      const received = vi.fn()
      reader.onAny(received)
      expect(await lobbies(reader)).toEqual([
        { gameId: shared.gameId, name: 'Shared game', players: [], map: demoMap },
      ])

      const first = await connect('First')
      const firstJoin = await join(first)
      const secondJoin = await join(await connect('Second'))
      expect(await lobbies(reader)).toEqual([{
        gameId: shared.gameId,
        name: 'Shared game',
        players: [
          { playerId: firstJoin.assignment.playerId, username: 'First' },
          { playerId: secondJoin.assignment.playerId, username: 'Second' },
        ],
        map: demoMap,
      }])
      await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })
      expect(await usernames(reader)).toEqual(['Second'])

      // Reading never made the reader a member: no player, robot, rooms, hand, or broadcasts.
      expect(shared.game.players).toHaveLength(1)
      expect(server.sockets.sockets.get(reader.id!)?.rooms).toEqual(new Set([reader.id]))
      expect(await reader.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId }))
        .toEqual({ outcome: 'GAME_NOT_FOUND' })
      expect(received).not.toHaveBeenCalled()
    })

    it('leaves a later join unaffected', async () => {
      const reader = await connect('Reader')
      await lobbies(reader)
      await lobbies(reader)
      const joined = await join(reader)
      expect(joined.state.players.map((player) => player.username)).toEqual(['Reader'])
      expect(shared.game.players).toHaveLength(1)
      expect(await usernames(reader)).toEqual(['Reader'])
    })

    it('does not reply without an acknowledgement', async () => {
      const client = await connect('Reader')
      const emit = client.emit.bind(client) as unknown as (event: string, payload: unknown) => void
      emit('game.getLobbyDetails', {})
      expect(await lobbies(client)).toHaveLength(1)
      expect(shared.game.players).toHaveLength(0)
    })
  })
})
