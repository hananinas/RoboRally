import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ClientToServerEvents, GameInitialization, LobbyState, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultGame } from '@/game/GameFactory'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import { createSessionStore, type SessionStore } from '@/auth/sessionStore'
import { authCookieHeader } from './authTestHelper.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
describe('lobby lifecycle over Socket.IO', () => {
  let server: GameSocketServer
  let sessionStore: SessionStore
  let url: string
  let clients: Client[]
  const factory = vi.fn(createDefaultGame)
  beforeEach(async () => {
    clients = []
    factory.mockReset().mockImplementation(createDefaultGame)
    const http = createServer()
    sessionStore = createSessionStore()
    server = createGameSocketServer(http, sessionStore, factory)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })
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
  async function create(client: Client): Promise<LobbyState> {
    const result = await client.emitWithAck('lobby.create', {})
    if (result.outcome !== 'LOBBY_JOINED') throw new Error(result.outcome)
    return result.lobby
  }
  function started(client: Client): Promise<GameInitialization> {
    return new Promise((resolve) => client.once('game.started', ({ initialization }) => resolve(initialization)))
  }
  async function disconnect(client: Client) {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    client.disconnect()
    await closed
  }
  it('validates requests without allocating games or rooms', async () => {
    const client = await connect('Bence')
    const raw = client.emitWithAck.bind(client) as (event: string, payload: unknown) => Promise<unknown>
    expect(await raw('lobby.create', { name: 'Custom' })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw('lobby.join', { lobbyId: 'invalid' })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await client.emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
    expect(factory).not.toHaveBeenCalled()
    expect(server.sockets.sockets.get(client.id!)!.rooms).toEqual(new Set([client.id]))
  })
  it('creates only a waiting room, accepts duplicate creates/joins, and restricts the owning connection', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    expect(lobby.name).toMatch(/^Lobby /)
    expect(await create(owner)).toEqual(lobby)
    expect(server.sockets.sockets.get(owner.id!)!.rooms).toEqual(new Set([owner.id, `lobby:${lobby.lobbyId}`]))
    expect(await owner.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LOBBY_JOINED', lobby })
    const duplicate = await connect('Owner')
    expect(await duplicate.emitWithAck('lobby.create', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    expect(await duplicate.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    expect(await duplicate.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'NOT_LOBBY_MEMBER' })
    expect(factory).not.toHaveBeenCalled()
  })
  it.each(['leave', 'disconnect'] as const)('updates the roster and owner on %s without notifying other lobbies', async (departure) => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const first = lobby.players[0]!
    expect(first).toEqual({ userId: lobby.ownerUserId, username: 'Owner' })
    expect(lobby.players).toHaveLength(lobby.playerCount)
    const outsider = await connect('Outsider')
    await create(outsider)
    const foreignUpdates = vi.fn()
    outsider.on('lobby.updated', foreignUpdates)

    const other = await connect('Other')
    const joined = new Promise<LobbyState>((resolve) => owner.once('lobby.updated', ({ lobby: state }) => resolve(state)))
    const result = await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    if (result.outcome !== 'LOBBY_JOINED') throw new Error(result.outcome)
    const roster = result.lobby
    expect(await joined).toEqual(roster)
    expect(roster.players).toEqual([first, { userId: expect.any(String), username: 'Other' }])
    expect(roster.playerCount).toBe(2)
    expect(await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual(result)
    expect(await other.emitWithAck('session.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby: roster })
    const listed = await outsider.emitWithAck('lobby.list', {})
    if (listed.outcome !== 'LOBBIES_FOUND') throw new Error(listed.outcome)
    expect(listed.lobbies.find(({ lobbyId }) => lobbyId === lobby.lobbyId)).toEqual({
      lobbyId: lobby.lobbyId, name: lobby.name, playerCount: 2, maxPlayers: 6,
    })

    const left = new Promise<LobbyState>((resolve) => other.once('lobby.updated', ({ lobby: state }) => resolve(state)))
    if (departure === 'leave') await owner.emitWithAck('lobby.leave', { lobbyId: lobby.lobbyId })
    else await disconnect(owner)
    expect(await left).toEqual({ ...roster, ownerUserId: roster.players[1]!.userId, playerCount: 1, players: [roster.players[1]!] })
    await outsider.emitWithAck('session.get', {})
    expect(foreignUpdates).not.toHaveBeenCalled()
  })
  it('enforces six members, including idempotent rejoin at capacity', async () => {
    const owner = await connect('0')
    const lobby = await create(owner)
    for (let index = 1; index < 6; index++) {
      const client = await connect(String(index))
      expect((await client.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).outcome).toBe('LOBBY_JOINED')
    }
    expect((await owner.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).outcome).toBe('LOBBY_JOINED')
    const extra = await connect('Extra')
    expect(await extra.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LOBBY_FULL' })
    const ready = started(owner)
    await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })
    expect(new Set((await ready).state.robots.map((robot) => robot.colour)).size).toBe(6)
  })
  it('starts only for the owner, moves all members, and sends only their own hand', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    expect(await other.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'NOT_LOBBY_OWNER' })
    const initializations = [started(owner), started(other)]
    const result = await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })
    expect(result.outcome).toBe('STARTED')
    const [first, second] = await Promise.all(initializations)
    expect(first.state).toEqual(second.state)
    expect(new Set(first.state.robots.map((robot) => robot.colour)).size).toBe(2)
    expect(first.state.players.map((player) => player.username)).toEqual(['Owner', 'Other'])
    expect(first.hand).toHaveLength(9)
    expect(second.hand.every((card) => !first.hand.some((own) => own.id === card.id))).toBe(true)
    for (const [client, initialization] of [[owner, first], [other, second]] as const) {
      expect(server.sockets.sockets.get(client.id!)!.rooms).toEqual(new Set([
        client.id, `game:${initialization.assignment.gameId}:public`,
        `game:${initialization.assignment.gameId}:player:${initialization.assignment.playerId}`,
      ]))
    }
    expect(server.sockets.adapter.rooms.has(`lobby:${lobby.lobbyId}`)).toBe(false)
    expect(await owner.emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
    expect(await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
    const outsider = await connect('Outsider')
    expect(await outsider.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(await outsider.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
    expect(await outsider.emitWithAck('program.submit', {
      gameId: first.assignment.gameId, playerId: first.assignment.playerId,
      cardIds: first.hand.slice(0, 5).map((card) => card.id) as [string, string, string, string, string],
    })).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(factory).toHaveBeenCalledTimes(1)
  })
  it.each(['missing', 'disconnected'] as const)('keeps the lobby retryable when a member is %s before start', async (state) => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    const connection = server.sockets.sockets.get(other.id!)!
    if (state === 'missing') server.sockets.sockets.delete(other.id!)
    else connection.connected = false
    try {
      expect(await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId }))
        .toEqual({ outcome: 'LOBBY_MEMBER_DISCONNECTED' })
      expect(factory).not.toHaveBeenCalled()
      expect(await owner.emitWithAck('session.get', {}))
        .toMatchObject({ outcome: 'IN_LOBBY', lobby: { lobbyId: lobby.lobbyId, playerCount: 2 } })
      expect([...server.sockets.adapter.rooms.keys()].some((room) => room.startsWith('game:'))).toBe(false)
    } finally {
      server.sockets.sockets.set(other.id!, connection)
      connection.connected = true
    }
    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).outcome).toBe('STARTED')
    expect((await ready).state.players).toHaveLength(2)
  })

  it('transfers ownership in join order and removes the last waiting member on disconnect', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    const updated = new Promise<LobbyState>((resolve) => other.once('lobby.updated', ({ lobby: state }) => resolve(state)))
    expect(await owner.emitWithAck('lobby.leave', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LEFT' })
    expect((await updated).ownerUserId).toBe('Other')
    await disconnect(other)
    expect(await owner.emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
    expect(server.sockets.adapter.rooms.has(`lobby:${lobby.lobbyId}`)).toBe(false)
  })
  it('keeps the lobby usable if game preparation fails', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const events = vi.fn()
    owner.on('game.started', events)
    factory.mockImplementationOnce(() => { throw new Error('Cannot construct game') })
    expect(await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(server.sockets.sockets.get(owner.id!)!.rooms).toEqual(new Set([owner.id, `lobby:${lobby.lobbyId}`]))
    expect(events).not.toHaveBeenCalled()
    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).outcome).toBe('STARTED')
    await ready
  })
  it('isolates games and revokes room access on explicit game leave', async () => {
    const owners = [await connect('First'), await connect('Second')]
    const initializations: GameInitialization[] = []
    for (const owner of owners) {
      const lobby = await create(owner)
      const ready = started(owner)
      await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })
      initializations.push(await ready)
    }
    expect(initializations[0].assignment.gameId).not.toBe(initializations[1].assignment.gameId)
    const foreignEvents = vi.fn()
    owners[1].onAny(foreignEvents)
    expect(await owners[0].emitWithAck('game.leave', { gameId: initializations[1].assignment.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(await owners[0].emitWithAck('game.leave', { gameId: initializations[0].assignment.gameId })).toEqual({ outcome: 'LEFT' })
    await owners[1].emitWithAck('session.get', {})
    expect(foreignEvents).not.toHaveBeenCalled()
    expect(server.sockets.sockets.get(owners[0].id!)!.rooms).toEqual(new Set([owners[0].id]))
    expect((await create(owners[0])).name).toMatch(/^Lobby /)
  })
  it('discovers a committed start when its notification or acknowledgement was missed', async () => {
    const owner = await connect('Owner')
    expect(await owner.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    const lobby = await create(owner)
    expect(await owner.emitWithAck('session.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby })
    // Deliberately do not install a game.started listener or await its start ack.
    owner.emit('lobby.start', { lobbyId: lobby.lobbyId }, () => {})
    const session = await owner.emitWithAck('session.get', {})
    expect(session.outcome).toBe('IN_GAME')
    if (session.outcome !== 'IN_GAME') throw new Error(session.outcome)
    expect(session.initialization.hand).toHaveLength(9)
    expect(factory).toHaveBeenCalledTimes(1)
    const duplicate = await connect('Owner')
    expect(await duplicate.emitWithAck('session.get', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    await disconnect(owner)
    const restored = await duplicate.emitWithAck('session.get', {})
    expect(restored.outcome).toBe('IN_GAME')
    if (restored.outcome !== 'IN_GAME') throw new Error(restored.outcome)
    expect(restored.initialization.assignment).toEqual(session.initialization.assignment)
    expect(restored.initialization.state.robots).toEqual(session.initialization.state.robots)
    expect(restored.initialization.hand).toEqual(session.initialization.hand)
    expect(restored.initialization.state.paused).toBe(false)
  })
  it('removes a disconnected waiting member before start and preserves a disconnected game member after it', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    await disconnect(other)
    const ready = started(owner)
    await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })
    expect((await ready).state.players).toHaveLength(1)
    const replacement = await connect('Other')
    expect(await replacement.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    await disconnect(owner)
    const returnedOwner = await connect('Owner')
    const result = await returnedOwner.emitWithAck('session.get', {})
    expect(result.outcome).toBe('IN_GAME')
  })
  it('rejects recovery of a stale waiting room instead of restoring a removed membership', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    const offset = new Promise((resolve) => owner.once('lobby.updated', resolve))
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    await offset
    const closed = new Promise((resolve) => server.sockets.sockets.get(owner.id!)!.once('disconnect', resolve))
    owner.io.engine.close()
    await closed
    const rejected = new Promise<Error>((resolve) => owner.once('connect_error', resolve))
    owner.connect()
    expect((await rejected).message).toBe('SESSION_EXPIRED')
    const replacement = await connect('Owner')
    expect(await replacement.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    const state = await other.emitWithAck('session.get', {})
    expect(state.outcome).toBe('IN_LOBBY')
    if (state.outcome === 'IN_LOBBY') expect(state.lobby.playerCount).toBe(1)
  })
  it('rolls back partially joined game rooms before publishing a failed start', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const serverSocket = server.sockets.sockets.get(owner.id!)!
    const original = serverSocket.join.bind(serverSocket)
    vi.spyOn(serverSocket, 'join').mockImplementationOnce(original).mockImplementationOnce(() => { throw new Error('Room failure') })
    expect(await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(serverSocket.rooms).toEqual(new Set([owner.id, `lobby:${lobby.lobbyId}`]))
    expect((await owner.emitWithAck('session.get', {})).outcome).toBe('IN_LOBBY')
    expect([...server.sockets.adapter.rooms.keys()].some((room) => room.startsWith('game:'))).toBe(false)
  })

  it('returns an internal error without retaining a failed lobby creation', async () => {
    const owner = await connect('Owner')
    const connection = server.sockets.sockets.get(owner.id!)!
    vi.spyOn(connection, 'join').mockImplementationOnce(() => { throw new Error('Room failure') })
    expect(await owner.emitWithAck('lobby.create', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(await owner.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(await owner.emitWithAck('lobby.list', {})).toEqual({ outcome: 'LOBBIES_FOUND', lobbies: [] })
    expect(connection.rooms).toEqual(new Set([owner.id]))
    expect((await create(owner)).playerCount).toBe(1)
  })

  it('keeps a lobby available for retry after game creation fails', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    factory.mockImplementationOnce(() => { throw new Error('Factory failure') })
    expect(await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(await owner.emitWithAck('session.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby })
    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })).outcome).toBe('STARTED')
    await ready
  })

  it('restores membership and rooms when reattaching a game fails partway through', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const ready = started(owner)
    await owner.emitWithAck('lobby.start', { lobbyId: lobby.lobbyId })
    const initialization = await ready
    await disconnect(owner)
    const returned = await connect('Owner')
    const connection = server.sockets.sockets.get(returned.id!)!
    const join = connection.join.bind(connection)
    vi.spyOn(connection, 'join').mockImplementationOnce((rooms) => {
      void join(Array.isArray(rooms) ? rooms[0] : rooms)
      throw new Error('Room failure')
    })
    expect(await returned.emitWithAck('session.get', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(connection.rooms).toEqual(new Set([returned.id]))
    const restored = await returned.emitWithAck('session.get', {})
    expect(restored).toMatchObject({
      outcome: 'IN_GAME', initialization: { assignment: initialization.assignment, state: { paused: false } },
    })
  })

})
