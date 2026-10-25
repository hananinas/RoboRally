import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { submitProgramSchema } from '@robo-rally/game-events'
import type {
  CardsDealt, ClientToServerEvents, GameStarted, JoinAccepted, LobbyState, PlayerConnectionChanged,
  PlayerCheckpointProgress, RobotActionResolved, ServerToClientEvents,
} from '@robo-rally/game-events'
import { io as createClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Board, EmptyTile, PitTile, Game, Card, type Tile } from '@/game/index.ts'
import { createGame, createHand } from '@/game/GameFactory.ts'
import { createGameSocketServer, type GameSession, type GameSocketServer } from '@/socket/gameServer.ts'
import { Integer } from '@/numbers'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>

describe('lobby and game sessions over Socket.IO', () => {
  let server: GameSocketServer
  let shared: GameSession
  let factory: Mock<() => GameSession>
  let url: string
  let clients: Client[]

  beforeEach(async () => {
    shared = createGame('empty-map', 'Test game')
    factory = vi.fn(() => shared)
    clients = []
    const http = createServer()
    server = createGameSocketServer(http, factory)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function connect(username?: string, options?: Partial<Parameters<typeof createClient>[1]>): Promise<Client> {
    const client: Client = createClient(url, {
      autoConnect: false, transports: ['websocket'], reconnection: false, ...options,
    })
    clients.push(client)
    const connected = Promise.withResolvers<void>()
    client.once('connect', connected.resolve)
    client.once('connect_error', connected.reject)
    client.connect()
    await connected.promise
    if (username !== undefined) await client.timeout(1000).emitWithAck('user.login', { username })
    return client
  }

  async function lobby(client: Client): Promise<LobbyState> {
    const result = await client.timeout(1000).emitWithAck('lobby.create', {})
    if (result.outcome !== 'LOBBY_JOINED') throw new Error(result.outcome)
    return result.lobby
  }

  async function startGame(members: Client[]): Promise<JoinAccepted[]> {
    const waiting = await lobby(members[0])
    for (const client of members.slice(1)) {
      expect(await client.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId }))
        .toMatchObject({ outcome: 'LOBBY_JOINED' })
    }
    const started = members.map((client) => {
      const event = Promise.withResolvers<GameStarted>()
      client.once('game.started', event.resolve)
      return event.promise
    })
    expect(await members[0].timeout(1000).emitWithAck('lobby.start', { lobbyId: waiting.lobbyId }))
      .toEqual({ outcome: 'STARTED', gameId: shared.gameId })
    return (await Promise.all(started)).map((event) => {
      expect(event.lobbyId).toBe(waiting.lobbyId)
      return event.initialization
    })
  }

  async function snapshot(client: Client): Promise<JoinAccepted> {
    const result = await client.timeout(1000).emitWithAck('session.get', {})
    if (result.outcome !== 'IN_GAME') throw new Error(result.outcome)
    return result.initialization
  }

  async function disconnectClient(client: Client, recoverable = false): Promise<void> {
    const closed = Promise.withResolvers<void>()
    server.sockets.sockets.get(client.id!)!.once('disconnect', () => closed.resolve())
    if (recoverable) client.io.engine.close()
    else client.disconnect()
    await closed.promise
  }

  function connectionChanges(client: Client, count: number): Promise<PlayerConnectionChanged[]> {
    const changed = Promise.withResolvers<PlayerConnectionChanged[]>()
    const seen: PlayerConnectionChanged[] = []
    client.on('game.playerConnectionChanged', (payload) => {
      seen.push(payload)
      if (seen.length === count) changed.resolve(seen)
    })
    return changed.promise
  }

  function raw(client: Client, event: string, payload: unknown): Promise<unknown> {
    const emit = client.emit.bind(client) as unknown as
      (event: string, payload: unknown, acknowledge: (result: unknown) => void) => void
    const acknowledged = Promise.withResolvers<unknown>()
    emit(event, payload, acknowledged.resolve)
    return acknowledged.promise
  }

  function submission(joined: JoinAccepted) {
    return submitProgramSchema.parse({ gameId: joined.assignment.gameId, playerId: joined.assignment.playerId,
      cardIds: joined.hand.slice(0, 5).map((card) => card.id) })
  }

  it('requires login, validates commands, and leaves browsing free of rooms, games and hands', async () => {
    const client = await connect()
    for (const event of ['lobby.list', 'lobby.create', 'session.get']) {
      expect(await raw(client, event, {})).toEqual({ outcome: 'LOGIN_REQUIRED' })
    }
    expect(await raw(client, 'user.login', null)).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw(client, 'user.login', { username: '' })).toEqual({ outcome: 'INVALID_USERNAME' })
    const login = await client.timeout(1000).emitWithAck('user.login', { username: 'Dane' })
    expect(login.outcome).toBe('LOGGED_IN')
    expect(await client.timeout(1000).emitWithAck('user.login', { username: 'Dane' })).toEqual(login)
    expect(await client.timeout(1000).emitWithAck('user.login', { username: 'Other' })).toEqual({ outcome: 'ALREADY_LOGGED_IN' })
    const events = vi.fn()
    client.onAny(events)
    expect(await client.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(await client.timeout(1000).emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
    for (const event of ['lobby.list', 'lobby.create', 'session.get']) {
      expect(await raw(client, event, { extra: true })).toEqual({ outcome: 'INVALID_REQUEST' })
      expect(await raw(client, event, null)).toEqual({ outcome: 'INVALID_REQUEST' })
    }
    for (const event of ['lobby.join', 'lobby.leave', 'lobby.start']) {
      expect(await raw(client, event, { lobbyId: 'bad' })).toEqual({ outcome: 'INVALID_REQUEST' })
      expect(await raw(client, event, { lobbyId: randomUUID(), extra: true })).toEqual({ outcome: 'INVALID_REQUEST' })
      expect(await raw(client, event, { lobbyId: randomUUID() })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
    }
    expect(factory).not.toHaveBeenCalled()
    expect(server.sockets.sockets.get(client.id!)?.rooms).toEqual(new Set([client.id]))
    expect(events).not.toHaveBeenCalled()
  })

  it('lists generated waiting lobbies, limits capacity to six, and rejects competing sessions', async () => {
    const owner = await connect('Owner')
    const waiting = await lobby(owner)
    expect(waiting).toMatchObject({ name: expect.any(String), maxPlayers: 6, playerCount: 1 })
    expect(waiting.name.length).toBeGreaterThan(0)
    const same = await connect('Owner')
    expect(await same.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    expect(await same.timeout(1000).emitWithAck('lobby.create', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    for (let index = 0; index < 5; index++) {
      const member = await connect(`Member ${index}`)
      expect(await member.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId }))
        .toMatchObject({ outcome: 'LOBBY_JOINED', lobby: { playerCount: index + 2 } })
    }
    const reader = await connect('Reader')
    expect(await reader.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'LOBBY_FULL' })
    expect(await reader.timeout(1000).emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [{
      lobbyId: waiting.lobbyId, name: waiting.name, playerCount: 6, maxPlayers: 6,
    }] })
    expect(await owner.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby: { ...waiting, playerCount: 6 } })
    expect(factory).not.toHaveBeenCalled()
    expect(server.sockets.sockets.get(reader.id!)?.rooms).toEqual(new Set([reader.id]))
  })

  it('transfers ownership to the earliest remaining member on leave and disconnect, then deletes an empty lobby', async () => {
    const owner = await connect('Owner')
    const second = await connect('Second')
    const third = await connect('Third')
    const waiting = await lobby(owner)
    for (const member of [second, third]) await member.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId })
    expect(await third.timeout(1000).emitWithAck('lobby.start', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'NOT_LOBBY_OWNER' })
    const outsider = await connect('Outsider')
    expect(await outsider.timeout(1000).emitWithAck('lobby.leave', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'NOT_LOBBY_MEMBER' })
    expect(await outsider.timeout(1000).emitWithAck('lobby.start', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'NOT_LOBBY_MEMBER' })
    const transferred = new Promise((resolve) => second.once('lobby.updated', resolve))
    await owner.timeout(1000).emitWithAck('lobby.leave', { lobbyId: waiting.lobbyId })
    const secondUser = server.sockets.sockets.get(second.id!)!.data.user!
    expect(await transferred).toMatchObject({ lobby: { ownerUserId: secondUser.userId, playerCount: 2 } })
    expect(await owner.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    const disconnected = new Promise((resolve) => third.once('lobby.updated', resolve))
    await disconnectClient(second)
    expect(await disconnected).toMatchObject({ lobby: {
      ownerUserId: server.sockets.sockets.get(third.id!)!.data.user!.userId, playerCount: 1,
    } })
    const replacement = await connect('Second')
    expect(await replacement.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    await third.timeout(1000).emitWithAck('lobby.leave', { lobbyId: waiting.lobbyId })
    expect(await outsider.timeout(1000).emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
  })

  it('starts a fixed roster with distinct private assignments, hands, registers and stable colours', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const outside = await connect('Outside')
    const outsideEvents = vi.fn()
    outside.onAny(outsideEvents)
    const firstEvents: GameStarted[] = []
    const secondEvents: GameStarted[] = []
    first.on('game.started', (event) => firstEvents.push(event))
    second.on('game.started', (event) => secondEvents.push(event))
    const [initial, other] = await startGame([first, second])
    expect(firstEvents).toHaveLength(1)
    expect(secondEvents).toHaveLength(1)
    expect(initial.hand).toHaveLength(9)
    expect(other.assignment.playerId).not.toBe(initial.assignment.playerId)
    expect(other.assignment.robotId).not.toBe(initial.assignment.robotId)
    expect(other.hand.every((card) => !initial.hand.some((mine) => mine.id === card.id))).toBe(true)
    expect(initial.state).toEqual(other.state)
    expect(initial.state.players.map((player) => player.username)).toEqual(['First', 'Second'])
    expect(initial.state.players.every((player) => player.registers.every((slot) => slot.status === 'EMPTY'))).toBe(true)
    expect(new Set(initial.state.robots.map((robot) => robot.colour)).size).toBe(2)
    expect(shared.game.hasStarted).toBe(true)
    expect(shared.game.addPlayer().isErr()).toBe(true)
    expect(server.sockets.sockets.get(second.id!)?.rooms).toEqual(new Set([
      second.id, `game:${shared.gameId}:public`, `game:${shared.gameId}:player:${other.assignment.playerId}`,
    ]))
    expect(await first.timeout(1000).emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
    expect(await first.timeout(1000).emitWithAck('lobby.start', { lobbyId: firstEvents[0].lobbyId })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
    expect(await outside.timeout(1000).emitWithAck('lobby.join', { lobbyId: firstEvents[0].lobbyId })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
    expect(server.sockets.sockets.get(first.id!)?.eventNames()).not.toContain('game.join')
    expect(server.sockets.sockets.get(first.id!)?.eventNames()).not.toContain('game.getLobbyDetails')
    expect((await snapshot(first)).assignment).toEqual(initial.assignment)
    expect(outsideEvents).not.toHaveBeenCalled()
  })

  it('atomically admits only one connection for the same user', async () => {
    const first = await connect('Same')
    const second = await connect('Same')
    const results = await Promise.all([first, second].map((client) => client.timeout(1000).emitWithAck('lobby.create', {})))
    expect(results.map((result) => result.outcome).sort((a, b) => a.localeCompare(b))).toEqual(['LOBBY_JOINED', 'USER_ALREADY_IN_SESSION'])
    const loser = results[0].outcome === 'LOBBY_JOINED' ? second : first
    expect(server.sockets.sockets.get(loser.id!)?.rooms).toEqual(new Set([loser.id]))
  })

  it('rolls back all roster and room changes if initial presentation fails', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const waiting = await lobby(first)
    await second.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId })
    vi.spyOn(shared.game.board, 'getTile').mockImplementationOnce(() => { throw new Error('Presentation failed') })
    expect(await first.timeout(1000).emitWithAck('lobby.start', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(shared.game.players).toEqual([])
    expect(shared.game.board.occupantAt({ x: Integer(10), y: Integer(7) })).toBeUndefined()
    for (const client of [first, second]) expect(server.sockets.sockets.get(client.id!)?.rooms).toEqual(new Set([client.id, `lobby:${waiting.lobbyId}`]))
    expect(await first.timeout(1000).emitWithAck('session.get', {})).toMatchObject({ outcome: 'IN_LOBBY', lobby: { playerCount: 2 } })
    shared = createGame('empty-map')
    const initialized = new Promise((resolve) => first.once('game.started', resolve))
    expect(await first.timeout(1000).emitWithAck('lobby.start', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'STARTED', gameId: shared.gameId })
    await initialized
    expect(shared.game.players).toHaveLength(2)
  })

  it('rolls back an exhausted spawn roster instead of partially starting the lobby', async () => {
    shared = { gameId: randomUUID(), game: new Game(
      new Board([[new EmptyTile()]], { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }), [],
      Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'MOVE_1'))) }
    const first = await connect('First')
    const second = await connect('Second')
    const waiting = await lobby(first)
    await second.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId })
    expect(await first.timeout(1000).emitWithAck('lobby.start', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(shared.game.players).toEqual([])
    expect(shared.game.board.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(await second.timeout(1000).emitWithAck('session.get', {})).toMatchObject({ outcome: 'IN_LOBBY' })
  })

  it('rejects foreign players, hands and competing live session claims without changing ownership', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [initial, other] = await startGame([first, second])
    const outsider = await connect('Outside')
    expect(await outsider.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await second.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
    expect(await first.timeout(1000).emitWithAck('program.submit', { ...submission(initial), cardIds: submission(other).cardIds })).toEqual({ outcome: 'INVALID_PROGRAM' })
    const duplicate = await connect('First')
    expect(await duplicate.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    expect(await duplicate.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(await duplicate.timeout(1000).emitWithAck('lobby.create', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect((await snapshot(first)).programSubmitted).toBe(true)
    expect((await snapshot(second)).hand).toEqual(other.hand)
    expect(server.sockets.sockets.get(duplicate.id!)?.rooms).toEqual(new Set([duplicate.id]))
  })

  it('leaves without logging out, frees occupancy, revokes rooms and never reopens the roster', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [initial, other] = await startGame([first, second])
    const left = new Promise((resolve) => second.once('game.playerLeft', resolve))
    expect(await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'LEFT' })
    expect(await left).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, robotId: initial.assignment.robotId })
    expect(shared.game.board.occupantAt({ x: Integer(10), y: Integer(7) })).toBeUndefined()
    expect(server.sockets.sockets.get(first.id!)?.data.user?.username).toBe('First')
    expect(server.sockets.sockets.get(first.id!)?.rooms).toEqual(new Set([first.id]))
    expect(await first.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(shared.game.addPlayer().isErr()).toBe(true)
    expect((await snapshot(second)).state.robots[0].colour).toBe(other.state.robots[1].colour)
    expect(await first.timeout(1000).emitWithAck('lobby.create', {})).toMatchObject({ outcome: 'LOBBY_JOINED' })
  })

  it('rechecks the submission barrier when an unsubmitted member leaves and keeps the new hand private', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [initial] = await startGame([first, second])
    const outside = await connect('Outside')
    const excluded = vi.fn()
    second.on('cards.dealt', excluded)
    outside.onAny(excluded)
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))
    await second.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })
    expect(await hand).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand })
    await outside.timeout(1000).emitWithAck('session.get', {})
    expect(excluded).not.toHaveBeenCalled()
    expect(shared.game.phase).toBe('programming')
  })

  it('restores disconnected player, hand, checkpoint progress and colour, but rolls back failed snapshots', async () => {
    const first = await connect('First')
    const [initial] = await startGame([first])
    const player = shared.game.players[0]
    player.completeCheckpoint(1)
    await disconnectClient(first)
    const replacement = await connect('First')
    vi.spyOn(shared.game.board, 'getTile').mockImplementationOnce(() => { throw new Error('Presentation failed') })
    expect(await replacement.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(shared.game.paused).toBe(true)
    expect(server.sockets.sockets.get(replacement.id!)?.rooms).toEqual(new Set([replacement.id]))
    const restored = await snapshot(replacement)
    expect(restored.assignment).toEqual(initial.assignment)
    expect(restored.hand).toEqual(initial.hand)
    expect(shared.game.players[0]).toBe(player)
    expect(restored.state.players[0].lastCheckpoint).toBe(1)
    expect(restored.state.checkpointCount).toBe(2)
    expect(restored.state.robots[0].colour).toBe(initial.state.robots[0].colour)
    expect(shared.game.paused).toBe(false)
  })

  it('stays paused until every disconnected member reconnects and rejects stale programs while paused', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const third = await connect('Third')
    const [initial, , other] = await startGame([first, second, third])
    const changes = connectionChanges(third, 4)
    await disconnectClient(first)
    await disconnectClient(second)
    expect((await snapshot(third)).state.paused).toBe(true)
    expect(await third.timeout(1000).emitWithAck('program.submit', submitProgramSchema.parse({
      ...submission(other), cardIds: Array.from({ length: 5 }, () => randomUUID()),
    }))).toEqual({ outcome: 'GAME_PAUSED' })
    const returned = await connect('First')
    expect((await snapshot(returned)).assignment).toEqual(initial.assignment)
    expect(shared.game.paused).toBe(true)
    await snapshot(await connect('Second'))
    expect((await changes).map((change) => [change.connected, change.paused])).toEqual([
      [false, true], [false, true], [true, true], [true, false],
    ])
    expect(await returned.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
  })

  it('resumes preserved mid-activation execution only after reconnection', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    await startGame([first, second])
    for (const player of shared.game.players) shared.game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    await disconnectClient(first)
    expect(shared.game.currentRegister).toBe(4)
    const actions: unknown[] = []
    second.on('robot.actionResolved', (payload) => actions.push(payload))
    const hand = new Promise((resolve) => second.once('cards.dealt', resolve))
    await snapshot(await connect('First'))
    await hand
    expect(actions).toHaveLength(1)
    expect(shared.game.phase).toBe('programming')
    expect(shared.game.paused).toBe(false)
  })

  it('automatically restores recovered game rooms without a session.get command', async () => {
    const first = await connect('First', { reconnection: true, reconnectionDelay: 100 })
    const second = await connect('Second')
    const [initial] = await startGame([first, second])
    const changes = connectionChanges(second, 2)
    const replayedChanges = connectionChanges(first, 2)
    const reconnected = Promise.withResolvers<void>()
    first.once('connect', reconnected.resolve)
    await disconnectClient(first, true)
    expect(shared.game.paused).toBe(true)
    await reconnected.promise
    expect(first.recovered).toBe(true)
    expect((await changes).at(-1)).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, connected: true, paused: false })
    expect((await replayedChanges).map(({ connected, paused }) => ({ connected, paused }))).toEqual([
      { connected: false, paused: true }, { connected: true, paused: false },
    ])
    expect((await snapshot(first)).assignment).toEqual(initial.assignment)
  })

  it('rejects a recovered stale game owner after another connection reclaims the session', async () => {
    const stale = await connect('First', { reconnection: true, reconnectionDelay: 1000, randomizationFactor: 0 })
    const second = await connect('Second')
    const [initial] = await startGame([stale, second])
    const rejected = Promise.withResolvers<Error>()
    stale.once('connect_error', rejected.resolve)
    const transportPackets: string[] = []
    stale.io.on('open', () => stale.io.engine.on('data', (data: unknown) => {
      if (typeof data === 'string') transportPackets.push(data)
    }))
    await disconnectClient(stale, true)
    const replacement = await connect('First')
    expect((await snapshot(replacement)).assignment).toEqual(initial.assignment)
    server.to(`game:${shared.gameId}:player:${initial.assignment.playerId}`).emit('cards.dealt', {
      gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand,
    })
    expect((await rejected.promise).message).toBe('USER_ALREADY_IN_SESSION')
    expect(transportPackets.join('')).not.toContain(initial.hand[0].id)
    expect((await snapshot(replacement)).assignment).toEqual(initial.assignment)
    stale.io.reconnection(false)
  })

  it('rejects recovered lobby rooms because waiting disconnects expire membership', async () => {
    const first = await connect('First', { reconnection: true, reconnectionDelay: 100, randomizationFactor: 0 })
    const waiting = await lobby(first)
    // Fence lobby.updated so the client has a recovery offset before transport loss.
    await first.timeout(1000).emitWithAck('session.get', {})
    const rejected = new Promise<Error>((resolve) => first.once('connect_error', resolve))
    await disconnectClient(first, true)
    expect((await rejected).message).toBe('SESSION_EXPIRED')
    first.io.reconnection(false)
    const replacement = await connect('First')
    expect(await replacement.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(await replacement.timeout(1000).emitWithAck('lobby.join', { lobbyId: waiting.lobbyId })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
  })

  it('broadcasts checkpoint progress after register actions and before hands without repeating it', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [initial, other] = await startGame([first, second])
    expect(initial.state.checkpointCount).toBe(2)
    const spectator = await connect('Spectator')
    const spectatorProgress = vi.fn()
    spectator.on('player.checkpointProgress', spectatorProgress)
    const otherProgram = submitProgramSchema.parse({ ...submission(other), cardIds: [5, 0, 4, 7, 6].map((index) => other.hand[index].id) })
    const seen: { name: string; payload: unknown }[][] = [[], []]
    for (const [index, client] of [first, second].entries()) client.onAny((name, payload: unknown) => {
      if (['robot.actionResolved', 'player.checkpointProgress', 'cards.dealt'].includes(name)) seen[index].push({ name, payload })
    })
    for (const round of [1, 2]) {
      const hands = [first, second].map((client) => new Promise((resolve) => client.once('cards.dealt', resolve)))
      await first.timeout(1000).emitWithAck('program.submit', submission(initial))
      await second.timeout(1000).emitWithAck('program.submit', otherProgram)
      await Promise.all(hands)
      for (const events of seen) {
        const actions = Array.from({ length: 10 }, () => 'robot.actionResolved')
        expect(events.map((event) => event.name)).toEqual(round === 1
          ? [...actions.slice(0, 2), 'player.checkpointProgress', ...actions.slice(2, 8), 'player.checkpointProgress', ...actions.slice(8), 'cards.dealt']
          : [...actions, 'cards.dealt'])
        if (round === 1) expect(events.filter((event) => event.name === 'player.checkpointProgress').map((event) => event.payload)).toEqual(shared.game.players.map((player) => ({
          gameId: shared.gameId, playerId: player.id, lastCheckpoint: 1, checkpointCount: 2,
        })))
        events.length = 0
      }
    }
    expect((await snapshot(first)).state.players.map((player) => player.lastCheckpoint)).toEqual([1, 1])
    await spectator.timeout(1000).emitWithAck('session.get', {})
    expect(spectatorProgress).not.toHaveBeenCalled()
  })

  it('orders departure, checkpoint progress and private hands when leaving completes the final register', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [initial] = await startGame([first, second])
    for (const player of shared.game.players) shared.game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    const player = shared.game.players[0]
    expect(player.lastCheckpoint).toBe(1)
    shared.game.board.removeRobot(player.robot.id)
    shared.game.board.placeRobot(player.robot.id, { x: Integer(8), y: Integer(9) })
    const events: string[] = []
    first.onAny((name) => {
      if (['game.playerLeft', 'player.checkpointProgress', 'cards.dealt'].includes(name)) events.push(name)
    })
    const progress = new Promise<PlayerCheckpointProgress>((resolve) => first.once('player.checkpointProgress', resolve))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))
    expect(await second.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'LEFT' })
    expect(await hand).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand })
    expect(await progress).toEqual({ gameId: shared.gameId, playerId: player.id, lastCheckpoint: 2, checkpointCount: 2 })
    expect(events).toEqual(['game.playerLeft', 'player.checkpointProgress', 'cards.dealt'])
    expect(shared.game.phase).toBe('programming')
  })

  it('preserves permanent abort state through snapshots and still permits explicit leave', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [initial, other] = await startGame([first, second])
    const aborted = new Promise((resolve) => first.once('game.aborted', resolve))
    vi.spyOn(shared.game, 'executeNextAction').mockImplementationOnce(() => { throw new Error('boom') })
    await first.timeout(1000).emitWithAck('program.submit', submission(initial))
    await second.timeout(1000).emitWithAck('program.submit', submission(other))
    await aborted
    expect((await snapshot(first)).state.aborted).toBe(true)
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'GAME_ABORTED' })
    expect(await first.timeout(1000).emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'LEFT' })
  })

  it('creates fresh isolated games, schedulers and ownership for separate lobbies', async () => {
    factory.mockImplementation(() => {
      shared = createGame('empty-map')
      return shared
    })
    const first = await connect('First')
    const [initial] = await startGame([first])
    const firstGame = shared
    const second = await connect('Second')
    const [other] = await startGame([second])
    expect(other.assignment.gameId).not.toBe(initial.assignment.gameId)
    const secondEvents: string[] = []
    second.onAny((name) => secondEvents.push(name))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    await hand
    await snapshot(second)
    expect(secondEvents).toEqual([])
    expect(await first.timeout(1000).emitWithAck('program.submit', submission(other))).toEqual({ outcome: 'GAME_ID_MISMATCH' })
    await disconnectClient(first)
    expect(firstGame.game.paused).toBe(true)
    expect(shared.game.paused).toBe(false)
    expect((await snapshot(second)).assignment).toEqual(other.assignment)
  })

  it('ignores mutation commands without acknowledgements', async () => {
    const client = await connect()
    const emit = client.emit.bind(client) as unknown as (event: string, payload: unknown) => void
    emit('user.login', { username: 'First' })
    emit('lobby.create', {})
    emit('lobby.start', { lobbyId: randomUUID() })
    emit('program.submit', {})
    expect(await client.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'LOGIN_REQUIRED' })
    expect(server.sockets.sockets.get(client.id!)?.data.user).toBeUndefined()
    expect(factory).not.toHaveBeenCalled()
    await client.timeout(1000).emitWithAck('user.login', { username: 'First' })
    emit('lobby.create', {})
    expect(await client.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
  })

  describe('pit results over Socket.IO', () => {
    beforeEach(() => {
      const tiles: Tile[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
      tiles[1][2] = new PitTile()
      tiles[4][4] = new EmptyTile([], 1)
      tiles[4][0] = new EmptyTile([], 2)
      shared = {
        gameId: randomUUID(),
        game: new Game(new Board(tiles, { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }), [],
          createHand(), undefined, { x: Integer(4), y: Integer(4) }),
      }
    })

    function program(joined: JoinAccepted, indices: readonly number[]) {
      return submitProgramSchema.parse({
        gameId: shared.gameId, playerId: joined.assignment.playerId,
        cardIds: indices.map((index) => joined.hand[index].id),
      })
    }

    function broadcastNames(client: Client): string[] {
      const names: string[] = []
      client.onAny((name) => names.push(name))
      return names
    }

    it('broadcasts rebooted positions before progress and hands and restores them on rejoining', async () => {
      const client = await connect('First')
      const [initial] = await startGame([client])
      expect(initial.state.board.tiles.find((tile) => tile.type === 'PIT'))
        .toEqual({ position: { x: 2, y: 1 }, type: 'PIT' })
      const outsider = await connect('Login only')
      const outsideEvents = vi.fn()
      outsider.onAny(outsideEvents)
      const actions: RobotActionResolved[] = []
      const progress: PlayerCheckpointProgress[] = []
      const events = broadcastNames(client)
      client.on('robot.actionResolved', (action) => actions.push(action))
      client.on('player.checkpointProgress', (payload) => progress.push(payload))
      const hand = new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve))
      const reset = new Promise<void>((resolve) => client.once('game.programmingStarted', () => resolve()))

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
        playerId: initial.assignment.playerId,
        instruction: initial.hand[[2, 0, 4, 5, 3][registerIndex]].instruction, position,
      })))
      expect(progress).toEqual([{
        gameId: shared.gameId, playerId: initial.assignment.playerId, lastCheckpoint: 1, checkpointCount: 2,
      }])
      await reset
      expect(events).toEqual([
        'robot.actionResolved', 'player.checkpointProgress',
        ...Array.from({ length: 4 }, () => 'robot.actionResolved'),
        'cards.dealt', 'game.programmingStarted',
      ])
      const latest = await snapshot(client)
      expect(latest.state.phase).toBe('PROGRAMMING')
      expect(latest.state.robots).toMatchObject([{
        robotId: initial.assignment.robotId, playerId: initial.assignment.playerId,
        position: actions[4].position,
      }])
      expect(latest.state.players[0].lastCheckpoint).toBe(1)
      expect(shared.game.board.occupantAt({ x: Integer(2), y: Integer(1) })).toBeUndefined()
      expect(outsideEvents).not.toHaveBeenCalled()

      await disconnectClient(client)
      const restored = await snapshot(await connect('First'))
      expect(restored.assignment).toEqual(initial.assignment)
      expect(restored.hand).toEqual(initial.hand)
      expect(restored.state.robots).toMatchObject(latest.state.robots)
      expect(restored.state.players[0].lastCheckpoint).toBe(1)
      expect(restored.state.paused).toBe(false)
    })

    it('broadcasts the occupied-tile fallback to every member and uses its position for later priority', async () => {
      const clients = [await connect('First'), await connect('Second'), await connect('Third')]
      const joined = await startGame(clients)
      const robotIds = joined.map((entry) => entry.assignment.robotId)
      shared.game.board.relocateRobot(robotIds[1], { x: Integer(4), y: Integer(4) })
      const actions: RobotActionResolved[][] = clients.map(() => [])
      const dealt: CardsDealt[][] = clients.map(() => [])
      for (const [index, client] of clients.entries()) {
        await snapshot(client)
        client.on('robot.actionResolved', (action) => actions[index].push(action))
        client.on('cards.dealt', (cards) => dealt[index].push(cards))
      }
      const hands = clients.map((client) => new Promise<CardsDealt>((resolve) => client.once('cards.dealt', resolve)))
      for (const [index, client] of clients.entries()) {
        const indices = index === 0 ? [2, 4, 5, 6, 8] : [4, 5, 6, 8, 3]
        expect(await client.timeout(1000).emitWithAck('program.submit', program(joined[index], indices)))
          .toEqual({ outcome: 'ACCEPTED' })
      }

      expect(await Promise.all(hands)).toEqual(joined.map((entry) => ({
        gameId: shared.gameId, playerId: entry.assignment.playerId, cards: entry.hand,
      })))
      expect(actions[0]).toHaveLength(15)
      expect(actions[1]).toEqual(actions[0])
      expect(actions[2]).toEqual(actions[0])
      expect(actions[0][0]).toEqual({
        gameId: shared.gameId, registerIndex: 0, robotId: robotIds[0], playerId: joined[0].assignment.playerId,
        instruction: 'MOVE_3',
        position: { coordinate: { x: 4, y: 3 }, orientation: 'NORTH' },
      })
      expect(actions[0].slice(0, 3).map((action) => action.robotId)).toEqual([robotIds[0], robotIds[2], robotIds[1]])
      expect(actions[0].slice(3, 6).map((action) => action.robotId)).toEqual([robotIds[2], robotIds[0], robotIds[1]])
      for (const [index, client] of clients.entries()) {
        const latest = await snapshot(client)
        expect(latest.state.robots).toMatchObject(joined.map((entry) => ({
          robotId: entry.assignment.robotId, playerId: entry.assignment.playerId,
          position: actions[0].findLast((action) => action.robotId === entry.assignment.robotId)!.position,
        })))
        expect(new Set(latest.state.robots.map(({ position }) =>
          `${position.coordinate.x},${position.coordinate.y}`)).size).toBe(3)
        expect(dealt[index]).toEqual([{
          gameId: shared.gameId, playerId: joined[index].assignment.playerId, cards: joined[index].hand,
        }])
      }
      expect(shared.game.board.occupantAt({ x: Integer(2), y: Integer(1) })).toBeUndefined()
    })
  })
})
