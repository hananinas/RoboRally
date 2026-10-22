import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseSubmitProgram } from '@robo-rally/game-events'
import type { ClientToServerEvents, GameInitialization, PlayerConnectionChanged, PlayerCheckpointProgress, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '@/game/GameFactory'
import { createGameSocketServer, type GameSocketServer } from '@/gameServer'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
describe('started game membership over Socket.IO', () => {
  let server: GameSocketServer
  let shared: ReturnType<typeof createGame>
  let url: string
  let clients: Client[]
  beforeEach(async () => {
    shared = createGame('empty-map')
    clients = []
    const http = createServer()
    server = createGameSocketServer(http, () => shared)
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  async function connect(username?: string): Promise<Client> {
    const client: Client = io(url, { autoConnect: false, transports: ['websocket'], reconnection: false, ackTimeout: 1000 })
    clients.push(client)
    const connected = new Promise<void>((resolve) => client.once('connect', resolve))
    client.connect()
    await connected
    if (username !== undefined) await client.emitWithAck('user.login', { username })
    return client
  }
  async function snapshot(client: Client): Promise<GameInitialization> {
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
  const submission = (initial: GameInitialization) => parseSubmitProgram({
    gameId: initial.assignment.gameId, playerId: initial.assignment.playerId,
    cardIds: initial.hand.slice(0, 5).map((card) => card.id),
  })
  function raw(client: Client, event: string, payload: unknown): Promise<unknown> {
    return (client.emitWithAck as (event: string, payload: unknown) => Promise<unknown>)(event, payload)
  }

  it('keeps login separate from game membership and rejects malformed login/session requests', async () => {
    const client = await connect()
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'LOGIN_REQUIRED' })
    expect(await raw(client, 'user.login', null)).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await raw(client, 'user.login', { username: '' })).toEqual({ outcome: 'INVALID_USERNAME' })
    const login = await client.emitWithAck('user.login', { username: 'Dane' })
    expect(await client.emitWithAck('user.login', { username: 'Dane' })).toEqual(login)
    expect(await client.emitWithAck('user.login', { username: 'Other' })).toEqual({ outcome: 'ALREADY_LOGGED_IN' })
    expect(await raw(client, 'session.get', { gameId: shared.gameId })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(server.sockets.sockets.get(client.id!)!.rooms).toEqual(new Set([client.id]))
  })
  it('returns the same assignment and hand on repeated session discovery', async () => {
    const { members: [first], initializations: [initial] } = await startGame(['First', 'Second'])
    const repeated = await snapshot(first)
    expect(repeated).toEqual(initial)
    expect(shared.game.players).toHaveLength(2)
  })
  it('rejects nonmember, other-player and foreign-hand submissions', async () => {
    const { members: [first, second], initializations: [initial, other] } = await startGame(['First', 'Second'])
    const outsider = await connect('Outside')
    expect(await outsider.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await second.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.emitWithAck('program.submit', { ...submission(other), playerId: initial.assignment.playerId })).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect((await snapshot(first)).programSubmitted).toBe(true)
    expect((await snapshot(second)).hand).toEqual(other.hand)
  })
  it('revokes room access and frees occupancy when a member explicitly leaves', async () => {
    const { members: [first, second], initializations: [initial] } = await startGame(['First', 'Second'])
    const left = new Promise((resolve) => second.once('game.playerLeft', resolve))
    expect(await raw(first, 'game.leave', { gameId: shared.gameId, extra: true })).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await first.emitWithAck('game.leave', { gameId: shared.gameId })).toEqual({ outcome: 'LEFT' })
    expect(await left).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, robotId: initial.assignment.robotId })
    expect(shared.game.board.occupantAt({ x: 10, y: 7 })).toBeUndefined()
    expect(server.sockets.sockets.get(first.id!)!.rooms).toEqual(new Set([first.id]))
    expect(await first.emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(await first.emitWithAck('game.getPublicGameState', { gameId: shared.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(await first.emitWithAck('program.submit', submission(initial))).toEqual({ outcome: 'INVALID_PROGRAM' })
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
    const restoredFirst = await snapshot(returnedFirst)
    expect(restoredFirst.assignment).toEqual(initial.assignment)
    expect(restoredFirst.hand).toEqual(initial.hand)
    expect(restoredFirst.state.players[0].lastCheckpoint).toBe(1)
    expect(restoredFirst.state.paused).toBe(true)
    const returnedSecond = await connect('Second')
    const restoredSecond = await snapshot(returnedSecond)
    expect(restoredSecond.assignment).toEqual(other.assignment)
    expect(restoredSecond.state.paused).toBe(false)
    await witness.emitWithAck('game.getPublicGameState', { gameId: shared.gameId })
    expect(changed.map((event) => [event.connected, event.paused])).toEqual([[false, true], [false, true], [true, true], [true, false]])
  })
  it('resumes mid-activation after reattaching the last disconnected member', async () => {
    const { members: [first, second] } = await startGame(['First', 'Second'])
    for (const player of shared.game.players) shared.game.submitProgram(player.id, player.hand.slice(0, 5))
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    await disconnect(first)
    const actions: unknown[] = []
    second.on('robot.actionResolved', (payload) => actions.push(payload))
    const hand = new Promise((resolve) => second.once('cards.dealt', resolve))
    await snapshot(await connect('First'))
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
    await snapshot(replacement)
    const rejected = new Promise<Error>((resolve) => first.once('connect_error', resolve))
    first.connect()
    expect((await rejected).message).toBe('USER_ALREADY_IN_GAME')
    expect((await snapshot(replacement)).state.paused).toBe(false)
  })
  it('keeps the game paused when a reconnect snapshot fails and permits retry', async () => {
    const { members: [first], initializations: [initial] } = await startGame(['First'])
    await disconnect(first)
    const replacement = await connect('First')
    vi.spyOn(shared.game.board, 'getTile').mockImplementationOnce(() => { throw new Error('Snapshot failed') })
    expect(await replacement.emitWithAck('session.get', {})).toEqual({ outcome: 'INTERNAL_ERROR' })
    expect(shared.game.paused).toBe(true)
    expect(server.sockets.sockets.get(replacement.id!)!.rooms).toEqual(new Set([replacement.id]))
    expect((await snapshot(replacement)).assignment).toEqual(initial.assignment)
    expect(shared.game.paused).toBe(false)
  })
  it('broadcasts checkpoint progress before next hands when a departure completes the final register', async () => {
    const { members: [first, second], initializations: [initial] } = await startGame(['First', 'Second'])
    for (const player of shared.game.players) shared.game.submitProgram(player.id, player.hand.slice(0, 5))
    for (let action = 0; action < 9; action++) shared.game.executeNextAction()
    const player = shared.game.players[0]
    expect(player.lastCheckpoint).toBe(1)
    shared.game.board.removeRobot(player.robot.id)
    shared.game.board.placeRobot(player.robot.id, { x: 8, y: 9 })
    const events: string[] = []
    first.onAny((name) => { if (['game.playerLeft', 'player.checkpointProgress', 'cards.dealt'].includes(name)) events.push(name) })
    const progress = new Promise<PlayerCheckpointProgress>((resolve) => first.once('player.checkpointProgress', resolve))
    const hand = new Promise((resolve) => first.once('cards.dealt', resolve))
    await second.emitWithAck('game.leave', { gameId: shared.gameId })
    expect(await hand).toEqual({ gameId: shared.gameId, playerId: initial.assignment.playerId, cards: initial.hand })
    expect(await progress).toEqual({ gameId: shared.gameId, playerId: player.id, lastCheckpoint: 2, checkpointCount: 2 })
    expect(events).toEqual(['game.playerLeft', 'player.checkpointProgress', 'cards.dealt'])
  })
  it('ignores commands without acknowledgements', async () => {
    const client = await connect()
    const emit = client.emit.bind(client) as (event: string, payload: unknown) => void
    emit('user.login', { username: 'First' })
    emit('lobby.create', {})
    emit('program.submit', {})
    expect(await client.emitWithAck('session.get', {})).toEqual({ outcome: 'LOGIN_REQUIRED' })
    expect(shared.game.players).toHaveLength(0)
  })
})
