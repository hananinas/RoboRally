import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ClientToServerEvents, GameInitialization, LobbyState, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as GameFactory from '@/domain/game/GameFactory'
import { boardMaps } from '@/domain/game/boardMaps'
import type { BoardMapName } from '@/domain/game/boardMaps'
import { findRobotDefinition, robotCatalog } from '@/domain/game/robotCatalog'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import { createSessionStore, type SessionStore } from '@/auth/sessionStore'
import { authCookieHeader } from './authTestHelper.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
describe('lobby lifecycle over Socket.IO', () => {
  let server: GameSocketServer
  let sessionStore: SessionStore
  let url: string
  let clients: Client[]
  let createGame: MockInstance<typeof GameFactory.createGame>
  beforeEach(async () => {
    clients = []
    createGame = vi.spyOn(GameFactory, 'createGame')
    const http = createServer()
    sessionStore = createSessionStore({ oidcClient: { refreshToken: vi.fn() }, refreshBufferSeconds: 0 })
    server = createGameSocketServer(http, sessionStore)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.restoreAllMocks()
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
  async function create(client: Client, mapName: BoardMapName = 'test-map'): Promise<LobbyState> {
    const result = await client.emitWithAck('lobby.create', { mapName })
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
    expect(await raw('lobby.create', { unexpected: 'Custom' })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw('lobby.create', { mapName: 'not-a-map' })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw('lobby.create', { name: '   ' })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw('lobby.create', { name: 'x'.repeat(51) })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw('lobby.join', { lobbyId: 'invalid' })).toEqual({ outcome: 'INVALID_REQUEST' })
    const listed = await client.emitWithAck('lobby.list', {})
    if (listed.outcome !== 'LOBBIES_FOUND') throw new Error(listed.outcome)
    expect(listed.lobbies).toEqual([])
    expect(listed.maps).toEqual(Object.entries(boardMaps).map(([mapName, map]) => ({
      mapName, name: map.name, icon: map.icon,
    })))
    expect(listed.robots).toEqual(robotCatalog)
    expect(new Set(listed.robots.map((robot) => robot.id)).size).toBe(listed.robots.length)
    expect(createGame).not.toHaveBeenCalled()
    expect(server.sockets.sockets.get(client.id!)!.rooms).toEqual(new Set([client.id]))
  })
  it('creates only a waiting room, accepts duplicate creates/joins, and restricts the owning connection', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    expect(lobby.name).toMatch(/^Lobby /)
    expect(lobby.mapName).toBe('test-map')
    expect(await create(owner)).toEqual(lobby)
    expect(server.sockets.sockets.get(owner.id!)!.rooms).toEqual(new Set([owner.id, `lobby:${lobby.lobbyId}`]))
    expect(await owner.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LOBBY_JOINED', lobby })
    const duplicate = await connect('Owner')
    expect(await duplicate.emitWithAck('lobby.create', { mapName: 'test-map' })).toEqual({ outcome: 'ALREADY_HAS_MEMBERSHIP' })
    expect(await duplicate.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'ALREADY_HAS_MEMBERSHIP' })
    expect(await duplicate.emitWithAck('lobby.start', {})).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(createGame).not.toHaveBeenCalled()
  })
  it('uses the creator-provided lobby name', async () => {
    const owner = await connect('Owner')
    const result = await owner.emitWithAck('lobby.create', { mapName: 'empty-map', name: 'Friday Night' })
    if (result.outcome !== 'LOBBY_JOINED') throw new Error(result.outcome)
    expect(result.lobby.name).toBe('Friday Night')
    expect(result.lobby.mapName).toBe('empty-map')
    expect(result.lobby.mapDisplayName).toBe(boardMaps['empty-map'].name)
  })
  it('stores the lobby name trimmed, within the length limit', async () => {
    const owner = await connect('Padder')
    const result = await owner.emitWithAck('lobby.create', { mapName: 'empty-map', name: `  ${'x'.repeat(50)}  ` })
    if (result.outcome !== 'LOBBY_JOINED') throw new Error(result.outcome)
    expect(result.lobby.name).toBe('x'.repeat(50))
  })
  it('stores the selected robot and notifies other lobby members without echoing to the sender', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })

    const updated = new Promise<LobbyState>((resolve) => {
      const receiveUpdate = ({ lobby: state }: { lobby: LobbyState }) => {
        if (state.players.some((player) => player.robotSpriteId === 'fork-clamp')) {
          owner.off('lobby.updated', receiveUpdate)
          resolve(state)
        }
      }
      owner.on('lobby.updated', receiveUpdate)
    })
    const senderUpdates = vi.fn()
    other.on('lobby.updated', senderUpdates)
    expect(findRobotDefinition('fork-clamp')).toBeDefined()
    const result = await other.emitWithAck('lobby.selectRobot', { robotSpriteId: 'fork-clamp' })
    expect(result).toMatchObject({ outcome: 'ROBOT_SELECTED', lobby: { players: [
      { userId: lobby.ownerUserId, robotSpriteId: 'tank' },
      { userId: expect.any(String), robotSpriteId: 'fork-clamp' },
    ] } })
    if (result.outcome !== 'ROBOT_SELECTED') throw new Error(result.outcome)
    expect(await updated).toEqual(result.lobby)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(senderUpdates).not.toHaveBeenCalled()
    other.off('lobby.updated', senderUpdates)
    expect(await other.emitWithAck('membership.get', {})).toMatchObject({
      outcome: 'IN_LOBBY',
      lobby: { players: [{ robotSpriteId: 'tank' }, { robotSpriteId: 'fork-clamp' }] },
    })

    const ownerStarted = started(owner)
    const otherStarted = started(other)
    expect(await owner.emitWithAck('lobby.start', {})).toMatchObject({ outcome: 'STARTED' })
    const [ownerGame, otherGame] = await Promise.all([ownerStarted, otherStarted])
    expect(ownerGame.state.robots.find(({ robotId }) => robotId === ownerGame.assignment.robotId)?.robotSpriteId).toBe('tank')
    expect(otherGame.state.robots.find(({ robotId }) => robotId === otherGame.assignment.robotId)?.robotSpriteId).toBe('fork-clamp')

    const raw = other.emitWithAck.bind(other) as (event: string, payload: unknown) => Promise<unknown>
    expect(await raw('lobby.selectRobot', { robotSpriteId: 'unknown-robot' })).toEqual({ outcome: 'INVALID_REQUEST' })
  })
  it.each(['leave', 'disconnect'] as const)('updates the roster and owner on %s without notifying other lobbies', async (departure) => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const first = lobby.players[0]!
    expect(first).toEqual({ userId: lobby.ownerUserId, username: 'Owner', robotSpriteId: 'tank', colorHex: expect.any(String) })
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
    expect(roster.players).toEqual([first, { userId: expect.any(String), username: 'Other', robotSpriteId: 'tank', colorHex: expect.any(String) }])
    expect(roster.playerCount).toBe(2)
    expect(await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual(result)
    expect(await other.emitWithAck('membership.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby: roster, user: { userId: 'Other', username: 'Other' } })
    const listed = await outsider.emitWithAck('lobby.list', {})
    if (listed.outcome !== 'LOBBIES_FOUND') throw new Error(listed.outcome)
    expect(listed.lobbies.find(({ lobbyId }) => lobbyId === lobby.lobbyId)).toEqual({
      lobbyId: lobby.lobbyId, name: lobby.name, mapName: lobby.mapName,
      mapDisplayName: boardMaps[lobby.mapName as BoardMapName].name, mapIcon: boardMaps[lobby.mapName as BoardMapName].icon,
      playerCount: 2, maxPlayers: 6,
    })

    const left = new Promise<LobbyState>((resolve) => other.once('lobby.updated', ({ lobby: state }) => resolve(state)))
    if (departure === 'leave') await owner.emitWithAck('lobby.leave', {})
    else await disconnect(owner)
    expect(await left).toEqual({ ...roster, ownerUserId: roster.players[1]!.userId, playerCount: 1, players: [roster.players[1]!] })
    await outsider.emitWithAck('membership.get', {})
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
    await owner.emitWithAck('lobby.start', {})
    expect(new Set((await ready).state.robots.map((robot) => robot.colour)).size).toBe(6)
  })
  it('starts only for the owner, moves all members, and sends only their own hand', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    expect(await other.emitWithAck('lobby.start', {})).toEqual({ outcome: 'NOT_LOBBY_OWNER' })
    const initializations = [started(owner), started(other)]
    const result = await owner.emitWithAck('lobby.start', {})
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
    expect(await owner.emitWithAck('lobby.list', {})).toMatchObject({
      outcome: 'LOBBIES_FOUND', lobbies: [], maps: expect.any(Array), robots: expect.any(Array),
    })
    expect(await owner.emitWithAck('lobby.start', {})).toEqual({ outcome: 'NOT_A_MEMBER' })
    const outsider = await connect('Outsider')
    expect(await outsider.emitWithAck('membership.get', {})).toEqual({ outcome: 'NO_MEMBERSHIP', user: { userId: 'Outsider', username: 'Outsider' } })
    expect(await outsider.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })).toEqual({ outcome: 'LOBBY_NOT_FOUND' })
    expect(await outsider.emitWithAck('program.submit', {
      cardIds: first.hand.slice(0, 5).map((card) => card.id) as [string, string, string, string, string],
    })).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(createGame).toHaveBeenCalledTimes(1)
  })
  it('creates the game on the map selected when its lobby was created', async () => {
    const owner = await connect('Map Owner')
    const lobby = await create(owner, 'empty-map')
    expect(lobby.mapName).toBe('empty-map')
    expect(lobby.mapDisplayName).toBe(boardMaps['empty-map'].name)
    expect(lobby.mapIcon).toBe(boardMaps['empty-map'].icon)

    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    const initialization = await ready
    expect(createGame).toHaveBeenCalledWith('empty-map', expect.any(String))
    expect(initialization.state.board.width).toBe(21)
    expect(initialization.state.board.height).toBe(15)
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
      expect(await owner.emitWithAck('lobby.start', {}))
        .toEqual({ outcome: 'LOBBY_MEMBER_DISCONNECTED' })
      expect(createGame).not.toHaveBeenCalled()
      expect(await owner.emitWithAck('membership.get', {}))
        .toMatchObject({ outcome: 'IN_LOBBY', lobby: { lobbyId: lobby.lobbyId, playerCount: 2 } })
      expect([...server.sockets.adapter.rooms.keys()].some((room) => room.startsWith('game:'))).toBe(false)
    } finally {
      server.sockets.sockets.set(other.id!, connection)
      connection.connected = true
    }
    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    expect((await ready).state.players).toHaveLength(2)
  })

  it('transfers ownership in join order and removes the last waiting member on disconnect', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const other = await connect('Other')
    await other.emitWithAck('lobby.join', { lobbyId: lobby.lobbyId })
    const updated = new Promise<LobbyState>((resolve) => other.once('lobby.updated', ({ lobby: state }) => resolve(state)))
    expect(await owner.emitWithAck('lobby.leave', {})).toEqual({ outcome: 'LEFT' })
    expect((await updated).ownerUserId).toBe('Other')
    await disconnect(other)
    expect(await owner.emitWithAck('lobby.list', {})).toMatchObject({
      outcome: 'LOBBIES_FOUND', lobbies: [], maps: expect.any(Array), robots: expect.any(Array),
    })
    expect(server.sockets.adapter.rooms.has(`lobby:${lobby.lobbyId}`)).toBe(false)
  })
  it('treats leaving with no membership as already left', async () => {
    const stranger = await connect('Stranger')
    expect(await stranger.emitWithAck('lobby.leave', {})).toEqual({ outcome: 'LEFT' })
  })
  it('keeps the lobby usable if game preparation fails', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    const events = vi.fn()
    owner.on('game.started', events)
    createGame.mockImplementationOnce(() => { throw new Error('Cannot construct game') })
    expect(await owner.emitWithAck('lobby.start', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(server.sockets.sockets.get(owner.id!)!.rooms).toEqual(new Set([owner.id, `lobby:${lobby.lobbyId}`]))
    expect(events).not.toHaveBeenCalled()
    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    await ready
  })
  it('isolates games and revokes room access on explicit game leave', async () => {
    const owners = [await connect('First'), await connect('Second')]
    const initializations: GameInitialization[] = []
    for (const owner of owners) {
      await create(owner)
      const ready = started(owner)
      await owner.emitWithAck('lobby.start', {})
      initializations.push(await ready)
    }
    expect(initializations[0].assignment.gameId).not.toBe(initializations[1].assignment.gameId)
    const foreignEvents = vi.fn()
    owners[1].onAny(foreignEvents)
    expect(await owners[0].emitWithAck('game.leave', {})).toEqual({ outcome: 'LEFT' })
    await owners[1].emitWithAck('membership.get', {})
    expect(foreignEvents).not.toHaveBeenCalled()
    expect(server.sockets.sockets.get(owners[0].id!)!.rooms).toEqual(new Set([owners[0].id]))
    expect((await create(owners[0])).name).toMatch(/^Lobby /)
  })
  it('discovers a committed start when its notification or acknowledgement was missed', async () => {
    const owner = await connect('Owner')
    const ownerUser = { userId: 'Owner', username: 'Owner' }
    expect(await owner.emitWithAck('membership.get', {})).toEqual({ outcome: 'NO_MEMBERSHIP', user: ownerUser })
    const lobby = await create(owner)
    expect(await owner.emitWithAck('membership.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby, user: ownerUser })
    // Deliberately do not install a game.started listener or await its start ack.
    owner.emit('lobby.start', {}, () => {})
    const session = await owner.emitWithAck('membership.get', {})
    expect(session.outcome).toBe('IN_GAME')
    if (session.outcome !== 'IN_GAME') throw new Error(session.outcome)
    expect(session.initialization.hand).toHaveLength(9)
    expect(createGame).toHaveBeenCalledTimes(1)
    const duplicate = await connect('Owner')
    expect(await duplicate.emitWithAck('membership.get', {})).toEqual({ outcome: 'ALREADY_HAS_MEMBERSHIP' })
    await disconnect(owner)
    const restored = await duplicate.emitWithAck('membership.get', {})
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
    await owner.emitWithAck('lobby.start', {})
    expect((await ready).state.players).toHaveLength(1)
    const replacement = await connect('Other')
    expect(await replacement.emitWithAck('membership.get', {})).toEqual({ outcome: 'NO_MEMBERSHIP', user: { userId: 'Other', username: 'Other' } })
    await disconnect(owner)
    const returnedOwner = await connect('Owner')
    const result = await returnedOwner.emitWithAck('membership.get', {})
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
    expect((await rejected).message).toBe('SOCKET_SESSION_EXPIRED')
    const replacement = await connect('Owner')
    expect(await replacement.emitWithAck('membership.get', {})).toEqual({ outcome: 'NO_MEMBERSHIP', user: { userId: 'Owner', username: 'Owner' } })
    const state = await other.emitWithAck('membership.get', {})
    expect(state.outcome).toBe('IN_LOBBY')
    if (state.outcome === 'IN_LOBBY') expect(state.lobby.playerCount).toBe(1)
  })
  it('returns an internal error without retaining a failed lobby creation', async () => {
    const owner = await connect('Owner')
    const connection = server.sockets.sockets.get(owner.id!)!
    vi.spyOn(connection, 'join').mockImplementationOnce(() => { throw new Error('Room failure') })
    expect(await owner.emitWithAck('lobby.create', { mapName: 'test-map' })).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(await owner.emitWithAck('membership.get', {})).toEqual({ outcome: 'NO_MEMBERSHIP', user: { userId: 'Owner', username: 'Owner' } })
    expect(await owner.emitWithAck('lobby.list', {})).toMatchObject({
      outcome: 'LOBBIES_FOUND', lobbies: [], maps: expect.any(Array), robots: expect.any(Array),
    })
    expect(connection.rooms).toEqual(new Set([owner.id]))
    expect((await create(owner)).playerCount).toBe(1)
  })

  it('keeps a lobby available for retry after game creation fails', async () => {
    const owner = await connect('Owner')
    const lobby = await create(owner)
    createGame.mockImplementationOnce(() => { throw new Error('Factory failure') })
    expect(await owner.emitWithAck('lobby.start', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(await owner.emitWithAck('membership.get', {})).toEqual({ outcome: 'IN_LOBBY', lobby, user: { userId: 'Owner', username: 'Owner' } })
    const ready = started(owner)
    expect((await owner.emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    await ready
  })

  it('restores membership and rooms when reattaching a game fails partway through', async () => {
    const owner = await connect('Owner')
    await create(owner)
    const ready = started(owner)
    await owner.emitWithAck('lobby.start', {})
    const initialization = await ready
    await disconnect(owner)
    const returned = await connect('Owner')
    const connection = server.sockets.sockets.get(returned.id!)!
    const join = connection.join.bind(connection)
    vi.spyOn(connection, 'join').mockImplementationOnce((rooms) => {
      void join(Array.isArray(rooms) ? rooms[0] : rooms)
      throw new Error('Room failure')
    })
    expect(await returned.emitWithAck('membership.get', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(connection.rooms).toEqual(new Set([returned.id]))
    const restored = await returned.emitWithAck('membership.get', {})
    expect(restored).toMatchObject({
      outcome: 'IN_GAME', initialization: { assignment: initialization.assignment, state: { paused: false } },
    })
  })

})
