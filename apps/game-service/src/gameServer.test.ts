import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ClientToServerEvents, ServerToClientEvents, LoginResult, JoinResult } from '@robo-rally/game-events'
import { io as createSocketClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSharedGame } from './game/SinglePlayerGame.js'
import { createGameSocketServer, type GameSocketServer } from './gameServer.js'

describe('login and game membership', () => {
  let io: GameSocketServer
  let session: ReturnType<typeof createSharedGame>
  let serviceUrl: string
  let client: Socket<ServerToClientEvents, ClientToServerEvents>
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[]
  beforeEach(async () => {
    session = createSharedGame()
    const httpServer = createServer()
    io = createGameSocketServer(httpServer, session)
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    serviceUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
    clients = []
    client = createClient()
  })
  afterEach(async () => {
    for (const socket of clients) socket.disconnect()
    await new Promise<void>((resolve) => io.close(() => resolve()))
  })
  function createClient() {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = createSocketClient(serviceUrl, {
      autoConnect: false, transports: ['websocket'], reconnection: false,
    })
    clients.push(socket)
    return socket
  }
  async function connect(socket = client) {
    const connected = new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    socket.connect()
    await connected
  }
  function login(payload: unknown, socket = client): Promise<LoginResult> {
    return socket.timeout(1000).emitWithAck('user.login', payload as { username: string })
  }
  function join(socket = client): Promise<JoinResult> {
    return socket.timeout(1000).emitWithAck('game.join', { gameId: session.gameId })
  }
  it('binds an approved user to the connection and reuses it on repeated login', async () => {
    await connect()

    const result = await login({ username: 'Dane' })
    expect(result).toEqual({
      outcome: 'LOGGED_IN',
      user: { userId: expect.any(String), username: 'Dane' },
    })
    expect(await login({ username: 'Dane' })).toEqual(result)
    expect([...io.sockets.sockets.values()][0].data.user).toEqual(
      result.outcome === 'LOGGED_IN' ? result.user : undefined,
    )
  })

  it('shares a user across connections but keeps each socket independently logged in', async () => {
    await connect()
    const other = createClient()
    await connect(other)

    const first = await login({ username: 'Dane' })
    expect(await login({ username: 'Dane' }, other)).toEqual(first)
    expect(await login({ username: 'Other' })).toEqual({
      outcome: 'ALREADY_LOGGED_IN',
    })
    expect(await login({ username: 'Other' }, other)).toEqual({
      outcome: 'ALREADY_LOGGED_IN',
    })
  })

  it('requires a fresh login after disconnect while retaining the user', async () => {
    await connect()
    const first = await login({ username: 'Dane' })
    client.disconnect()

    const replacement = createClient()
    await connect(replacement)
    const replacementOnServer = [...io.sockets.sockets.values()].find(
      (socket) => socket.id === replacement.id,
    )
    expect(replacementOnServer?.data.user).toBeUndefined()
    expect(await login({ username: 'Dane' }, replacement)).toEqual(first)
  })

  it('rejects malformed login without changing connection identity', async () => {
    await connect()

    expect(await login(null)).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await login({ username: 'Dane', extra: true })).toEqual({
      outcome: 'INVALID_REQUEST',
    })
    expect(await login({ username: '' })).toEqual({
      outcome: 'INVALID_USERNAME',
    })
    expect([...io.sockets.sockets.values()][0].data.user).toBeUndefined()

    const approved = await login({ username: 'Dane' })
    expect(approved.outcome).toBe('LOGGED_IN')
    expect(await login({ username: '' })).toEqual({
      outcome: 'INVALID_USERNAME',
    })
    expect(await login({ username: 'Dane' })).toEqual(approved)
  })


  it('requires login and membership before granting room access or a hand', async () => {
    const dealt = vi.fn()
    client.on('cards.dealt', dealt)
    await connect()
    expect(await join()).toEqual({ outcome: 'LOGIN_REQUIRED' })
    await login({ username: 'A' })
    expect(await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: session.gameId }))
      .toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(session.game.players).toHaveLength(0)
    const serverSocket = io.sockets.sockets.get(client.id!)!
    expect([...serverSocket.rooms]).toEqual([client.id])
    expect(dealt).not.toHaveBeenCalled()
    const joined = await join()
    expect(joined.outcome).toBe('JOINED')
    if (joined.outcome !== 'JOINED') throw new Error('join failed')
    expect(joined.hand).toHaveLength(9)
    expect(joined.state.players).toEqual([{ playerId: joined.assignment.playerId, username: 'A', programSubmitted: false, participatesInRound: true }])
    expect(joined.state.robots[0].position.coordinate).toEqual({ x: 10, y: 7 })
    expect(await join()).toEqual(joined)
    expect(session.game.players).toHaveLength(1)
    expect(dealt).not.toHaveBeenCalled()
  })

  it('rejects duplicate user membership, preserves login on leave, and frees the spawn', async () => {
    await connect()
    const other = createClient()
    await connect(other)
    await login({ username: 'Same' })
    await login({ username: 'Same' }, other)
    const results = await Promise.all([join(), join(other)])
    expect(results.map((result) => result.outcome).sort()).toEqual(['JOINED', 'USER_ALREADY_IN_GAME'])
    const owner = results[0].outcome === 'JOINED' ? client : other
    const rejected = owner === client ? other : client
    expect(await owner.timeout(1000).emitWithAck('game.leave', { gameId: session.gameId })).toEqual({ outcome: 'LEFT' })
    expect(await owner.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: session.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(session.game.players).toHaveLength(0)
    expect(session.game.board.occupantAt({ x: 10, y: 7 })).toBeUndefined()
    expect((await join(rejected)).outcome).toBe('JOINED')
    expect((await login({ username: 'Same' }, owner)).outcome).toBe('LOGGED_IN')
  })

  it('broadcasts joins and disconnect removals and allows the remaining submitted player to continue', async () => {
    await connect()
    await login({ username: 'A' })
    const first = await join()
    if (first.outcome !== 'JOINED') throw new Error('join failed')
    const other = createClient()
    await connect(other)
    await login({ username: 'B' }, other)
    const joinedEvent = new Promise((resolve) => client.once('game.playerJoined', resolve))
    const second = await join(other)
    if (second.outcome !== 'JOINED') throw new Error('join failed')
    expect(await joinedEvent).toMatchObject({ robot: { robotId: second.assignment.robotId, position: { coordinate: { x: 9, y: 7 } } } })
    const cardIds = first.hand.slice(0, 5).map((card) => card.id) as [string, string, string, string, string]
    expect(await client.timeout(1000).emitWithAck('program.submit', { ...first.assignment, roundNumber: 1, cardIds, robotId: first.assignment.robotId } as never)).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await client.timeout(1000).emitWithAck('program.submit', { gameId: session.gameId, playerId: first.assignment.playerId, roundNumber: 1, cardIds })).toEqual({ outcome: 'ACCEPTED' })
    const left = new Promise((resolve) => client.once('game.playerLeft', resolve))
    const hand = new Promise((resolve) => client.once('cards.dealt', resolve))
    other.disconnect()
    expect(await left).toMatchObject({ playerId: second.assignment.playerId })
    expect(await hand).toMatchObject({ roundNumber: 2, playerId: first.assignment.playerId })
    expect(session.game.players).toHaveLength(1)
  })

  it('rejects malformed requests and commands without callbacks without changing membership', async () => {
    await connect()
    await login({ username: 'A' })
    expect(await client.timeout(1000).emitWithAck('game.join', null as never)).toEqual({ outcome: 'INVALID_REQUEST' })
    expect(await client.timeout(1000).emitWithAck('game.join', { gameId: '00000000-0000-4000-8000-000000000999' })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    const untyped = client as unknown as { emit: (event: string, payload: unknown) => void }
    untyped.emit('game.join', { gameId: session.gameId })
    untyped.emit('game.leave', null)
    untyped.emit('program.submit', null)
    expect(await client.timeout(1000).emitWithAck('game.getPublicGameState', { gameId: session.gameId })).toEqual({ outcome: 'GAME_NOT_FOUND' })
    expect(session.game.players).toHaveLength(0)
  })
})
