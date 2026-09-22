import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  ClientToServerEvents,
  LoginResult,
  ProgramResult,
  PublicGameStateResult,
  RobotActionResolved,
  ServerToClientEvents,
} from '@robo-rally/game-events'
import {
  io as createSocketClient,
  type Socket as ClientSocket,
} from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSinglePlayerGame,
  type SinglePlayerGame,
} from './game/index.js'
import { createGameSocketServer, type GameSocketServer } from './gameServer.js'
import {
  presentCardsDealt,
  presentPublicGameState,
} from './gamePresenter.js'

describe('game Socket.IO connection', () => {
  let httpServer: HttpServer
  let io: GameSocketServer
  let client: ClientSocket<ServerToClientEvents, ClientToServerEvents>
  let clients: ClientSocket<ServerToClientEvents, ClientToServerEvents>[]
  let serviceUrl: string
  let singlePlayerGame: SinglePlayerGame

  beforeEach(async () => {
    singlePlayerGame = createSinglePlayerGame()
    httpServer = createServer()
    io = createGameSocketServer(httpServer, singlePlayerGame)
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const { port } = httpServer.address() as AddressInfo
    serviceUrl = `http://127.0.0.1:${port}`
    clients = []
    client = createClient()
  })

  function createClient(): ClientSocket<
    ServerToClientEvents,
    ClientToServerEvents
  > {
    const socket = createSocketClient(serviceUrl, {
      autoConnect: false,
      transports: ['websocket'],
    })
    clients.push(socket)
    return socket
  }

  afterEach(async () => {
    for (const socket of clients) socket.disconnect()
    await new Promise<void>((resolve, reject) =>
      io.close((error) => (error ? reject(error) : resolve())),
    )
  })

  function connect(
    socket: ClientSocket<ServerToClientEvents, ClientToServerEvents> = client,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
      socket.connect()
    })
  }

  function submitProgram(payload: unknown): Promise<ProgramResult> {
    const untypedClient = client as unknown as {
      emit: (
        event: 'program.submit',
        submittedPayload: unknown,
        acknowledge: (result: ProgramResult) => void,
      ) => void
    }
    return new Promise((resolve) =>
      untypedClient.emit('program.submit', payload, resolve),
    )
  }

  function login(
    payload: unknown,
    socket: ClientSocket<ServerToClientEvents, ClientToServerEvents> = client,
  ): Promise<LoginResult> {
    const untypedClient = socket as unknown as {
      emit: (
        event: 'user.login',
        request: unknown,
        acknowledge: (result: LoginResult) => void,
      ) => void
    }
    return new Promise((resolve) => untypedClient.emit('user.login', payload, resolve))
  }

  function getPublicGameState(
    payload: unknown,
  ): Promise<PublicGameStateResult> {
    const untypedClient = client as unknown as {
      emit: (
        event: 'game.getPublicGameState',
        request: unknown,
        acknowledge: (result: PublicGameStateResult) => void,
      ) => void
    }
    return new Promise((resolve) =>
      untypedClient.emit('game.getPublicGameState', payload, resolve),
    )
  }

  function collectResolvedActions(): Promise<readonly RobotActionResolved[]> {
    return new Promise((resolve) => {
      const actions: RobotActionResolved[] = []
      const collect = (action: RobotActionResolved) => {
        actions.push(action)
        if (actions.length === 5) {
          client.off('robot.actionResolved', collect)
          resolve(actions)
        }
      }
      client.on('robot.actionResolved', collect)
    })
  }

  it('joins the game rooms and deals the player hand on connection', async () => {
    const dealt = new Promise<Parameters<ServerToClientEvents['cards.dealt']>[0]>(
      (resolve) => client.once('cards.dealt', resolve),
    )

    await connect()

    expect(await dealt).toEqual(presentCardsDealt(singlePlayerGame.player))
    const serverSocket = [...io.sockets.sockets.values()][0]
    expect(serverSocket.rooms).toEqual(
      new Set([
        serverSocket.id,
        `game:${singlePlayerGame.gameId}:public`,
        `game:${singlePlayerGame.gameId}:player:${singlePlayerGame.player.id}`,
      ]),
    )
  })

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

  it('acknowledges the current public game state', async () => {
    await connect()

    const state = await client.timeout(1_000).emitWithAck(
      'game.getPublicGameState',
      { gameId: singlePlayerGame.gameId },
    )

    expect(state).toEqual({
      outcome: 'GAME_FOUND',
      state: presentPublicGameState(
        singlePlayerGame.gameId,
        singlePlayerGame.game,
      ),
    })
  })

  it('acknowledges an unknown game without leaving the client waiting', async () => {
    await connect()

    const result = await client.timeout(1_000).emitWithAck(
      'game.getPublicGameState',
      { gameId: '00000000-0000-4000-8000-000000000999' },
    )

    expect(result).toEqual({ outcome: 'GAME_NOT_FOUND' })
  })

  it('rejects malformed state requests without terminating the service', async () => {
    await connect()

    await expect(getPublicGameState(null)).resolves.toEqual({
      outcome: 'GAME_NOT_FOUND',
    })
    await expect(
      getPublicGameState({ gameId: singlePlayerGame.gameId, extra: true }),
    ).resolves.toEqual({ outcome: 'GAME_NOT_FOUND' })
  })

  it('ignores commands without acknowledgement callbacks', async () => {
    await connect()
    const cardIds = singlePlayerGame.player.hand
      .slice(0, 5)
      .map((card) => card.id)
    const untypedClient = client as unknown as {
      emit: (event: string, payload: unknown) => void
    }

    untypedClient.emit('user.login', { username: 'Dane' })
    untypedClient.emit('game.getPublicGameState', null)
    untypedClient.emit('program.submit', {
      gameId: singlePlayerGame.gameId,
      cardIds,
    })

    const state = await getPublicGameState({ gameId: singlePlayerGame.gameId })
    expect([...io.sockets.sockets.values()][0].data.user).toBeUndefined()
    expect(state.outcome).toBe('GAME_FOUND')
    expect(singlePlayerGame.game.phase).toBe('programming')
    expect(singlePlayerGame.player.robot.program).toEqual([])
  })

  it('accepts an ordered program, executes five registers, and starts the next round', async () => {
    const initialHand = new Promise<
      Parameters<ServerToClientEvents['cards.dealt']>[0]
    >((resolve) => client.once('cards.dealt', resolve))
    await connect()
    await initialHand

    const observer = createClient()
    const submitted = new Promise<
      Parameters<ServerToClientEvents['program.submitted']>[0]
    >((resolve) => observer.once('program.submitted', resolve))
    const submittedToPlayer = vi.fn()
    client.on('program.submitted', submittedToPlayer)
    await connect(observer)

    const selectedCards = singlePlayerGame.player.hand.slice(0, 5)
    const submitToGame = vi.spyOn(singlePlayerGame.game, 'submitProgram')
    const actions = collectResolvedActions()
    const nextHand = new Promise<
      Parameters<ServerToClientEvents['cards.dealt']>[0]
    >((resolve) => client.once('cards.dealt', resolve))

    const result = await submitProgram({
      gameId: singlePlayerGame.gameId,
      cardIds: selectedCards.map((card) => card.id),
    })

    expect(result).toEqual({ outcome: 'ACCEPTED' })
    expect(submitToGame).toHaveBeenCalledExactlyOnceWith(
      singlePlayerGame.player.id,
      selectedCards,
    )
    expect(await submitted).toEqual({ playerId: singlePlayerGame.player.id })
    expect(submittedToPlayer).not.toHaveBeenCalled()
    const resolvedActions = await actions
    expect(resolvedActions.map((action) => action.instruction)).toEqual([
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
    ])
    expect(await nextHand).toEqual(presentCardsDealt(singlePlayerGame.player))
    expect(singlePlayerGame.game.phase).toBe('programming')
    expect(singlePlayerGame.game.currentRegister).toBe(0)
    expect(singlePlayerGame.player.robot.program).toEqual([])

    const nextState = await client.timeout(1_000).emitWithAck(
      'game.getPublicGameState',
      { gameId: singlePlayerGame.gameId },
    )
    expect(nextState.outcome).toBe('GAME_FOUND')
    if (nextState.outcome !== 'GAME_FOUND') {
      throw new Error('Game state was not found')
    }
    expect(nextState.state.phase).toBe('PROGRAMMING')
    expect(nextState.state.robots[0].position).toEqual(
      resolvedActions.at(-1)?.position,
    )
  })

  it('rejects malformed, unknown, and unavailable programs atomically', async () => {
    await connect()
    const cardIds = singlePlayerGame.player.hand
      .slice(0, 5)
      .map((card) => card.id)
    const invalidPayloads: readonly unknown[] = [
      {},
      { gameId: singlePlayerGame.gameId, cardIds: cardIds.slice(0, 4) },
      {
        gameId: singlePlayerGame.gameId,
        cardIds: [cardIds[0], cardIds[0], ...cardIds.slice(2)],
      },
      {
        gameId: singlePlayerGame.gameId,
        cardIds: [
          ...cardIds.slice(0, 4),
          '00000000-0000-4000-8000-000000000999',
        ],
      },
      {
        gameId: '00000000-0000-4000-8000-000000000999',
        cardIds,
      },
      { gameId: singlePlayerGame.gameId, cardIds, playerId: 'unexpected' },
    ]

    for (const payload of invalidPayloads) {
      await expect(submitProgram(payload)).resolves.toEqual({
        outcome: 'INVALID_PROGRAM',
      })
    }

    expect(singlePlayerGame.game.phase).toBe('programming')
    expect(singlePlayerGame.game.currentRegister).toBe(0)
    expect(singlePlayerGame.player.robot.program).toEqual([])
  })
})
