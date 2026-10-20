import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { submitProgramSchema } from '@robo-rally/game-events'
import type {
  ClientToServerEvents, JoinResult, PlayerConnectionChanged, ServerToClientEvents,
} from '@robo-rally/game-events'
import { io as createClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Board, EmptyTile, Game, Card } from '@/game/index.ts'
import { createSharedGame } from '@/game/SinglePlayerGame.ts'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer.ts'
import { Integer } from '@/numbers'

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
    return submitProgramSchema.parse({ gameId: shared.gameId, playerId: joined.assignment.playerId, cardIds: joined.hand.slice(0, 5).map((card) => card.id) })
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
    vi.spyOn(shared.game.board, 'getTile').mockImplementationOnce(() => { throw new Error('Presentation failed') })
    expect(await client.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(shared.game.players).toEqual([])
    expect(shared.game.board.occupantAt({ x: Integer(10), y: Integer(7) })).toBeUndefined()
    expect(server.sockets.sockets.get(client.id!)?.rooms).toEqual(new Set([client.id]))
    expect((await join(client)).state.robots).toHaveLength(1)
  })

  it('rejects nonmember and foreign-hand submissions and reports accepted programs', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    const other = await join(second)
    const outsider = await connect('Outside')
    expect(await outsider.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await second.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
    expect(await first.timeout(1000).emitWithAck('program.submit', {
      ...submission(initial), playerId: other.assignment.playerId,
    })).toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect(shared.game.hasSubmittedProgram(initial.assignment.playerId)).toBe(true)
    expect((await join(first)).programSubmitted).toBe(true)
    expect((await join(second)).hand).toEqual(other.hand)
  })

  it('closes new joins permanently on the first accepted program, not an invalid request', async () => {
    const first = await connect('First')
    const initial = await join(first)
    expect(await raw(first, 'program.submit', { ...submission(initial), cardIds: [] })).toEqual({ outcome: 'INVALID_REQUEST' })
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
    await outsider.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })
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
    expect(shared.game.board.occupantAt({ x: Integer(10), y: Integer(7) })).toBeUndefined()
    expect(server.sockets.sockets.get(first.id!)?.data.user?.username).toBe('First')
    expect(server.sockets.sockets.get(first.id!)?.rooms).toEqual(new Set([first.id]))
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
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

  it('retains disconnected membership, robot and hand for the returning user', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const disconnected = new Promise((resolve) => server.sockets.sockets.get(first.id!)!.once('disconnect', resolve))
    first.disconnect()
    await disconnected
    expect(shared.game.players).toHaveLength(1)
    const replacement = await connect('First')
    const restored = await join(replacement)
    expect(restored.assignment).toEqual(initial.assignment)
    expect(restored.hand).toEqual(initial.hand)
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
    expect((await join(otherSocket)).state.paused).toBe(true)
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

  it('rejects program submissions while paused even with stale card ids', async () => {
    const disconnectingSocket = await connect('A')
    await join(disconnectingSocket)
    const otherSocket = await connect('B')
    const otherPlayer = await join(otherSocket)

    await disconnectClient(disconnectingSocket)

    const staleSubmission = submitProgramSchema.parse({
      gameId: shared.gameId,
      playerId: otherPlayer.assignment.playerId,
      cardIds: Array.from({ length: 5 }, () => randomUUID()),
    })

    expect(await otherSocket.timeout(1000).emitWithAck('program.submit', staleSubmission))
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
      shared.game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
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

    expect((await join(newSocket)).assignment).toEqual(stalePlayer.assignment)
  })

  it('deals the remaining player a hand when leaving completes the final register', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    await join(second)
    for (const player of shared.game.players) {
      shared.game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    }
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    expect(shared.game.currentRegister).toBe(4)
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))

    expect(await second.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId }))
      .toEqual({ outcome: 'LEFT' })

    expect(await hand).toEqual({
      gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand,
    })
    expect(shared.game.phase).toBe('programming')
  })

  it('aborts the game permanently on an unexpected execution failure, still tells (re)joining members, and still allows leaving', async () => {
    const first = await connect('First')
    const initial = await join(first)
    const second = await connect('Second')
    const other = await join(second)

    const aborted = new Promise((resolve) => first.once('game.aborted', resolve))
    vi.spyOn(shared.game, 'executeNextAction').mockImplementationOnce(() => { throw new Error('boom') })
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    await second.timeout(1000).emitWithAck('program.submit', submission(other))
    await aborted

    expect(shared.game.aborted).toBe(true)
    expect((await join(first)).state.aborted).toBe(true)
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial)))
      .toMatchObject({ outcome: 'GAME_ABORTED' })
    expect(await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId }))
      .toEqual({ outcome: 'LEFT' })
  })

  it('ignores commands without acknowledgements without creating state', async () => {
    const client = await connect()
    const emit = client.emit.bind(client) as unknown as (event: string, payload: unknown) => void
    emit('user.login', { username: 'First' })
    emit('game.join', { gameId: shared.gameId })
    emit('game.leave', { gameId: shared.gameId })
    emit('program.submit', {})
    expect(await client.timeout(1000).emitWithAck('game.join', { gameId: shared.gameId }))
      .toEqual({ outcome: 'LOGIN_REQUIRED' })
    expect(shared.game.players).toHaveLength(0)
    expect(server.sockets.sockets.get(client.id!)?.data.user).toBeUndefined()
  })
})
