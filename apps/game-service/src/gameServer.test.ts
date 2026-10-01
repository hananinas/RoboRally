import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  ClientToServerEvents,
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
    io = createGameSocketServer(httpServer, {
      ...singlePlayerGame,
      playerForConnection: () => singlePlayerGame.player,
    })
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

  it('deals the assigned player hand on connection', async () => {
    const dealt = new Promise<Parameters<ServerToClientEvents['cards.dealt']>[0]>(
      (resolve) => client.once('cards.dealt', resolve),
    )

    await connect()

    expect(await dealt).toEqual(
      presentCardsDealt(singlePlayerGame.gameId, singlePlayerGame.player),
    )
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

    untypedClient.emit('game.getPublicGameState', null)
    untypedClient.emit('program.submit', {
      gameId: singlePlayerGame.gameId,
      playerId: singlePlayerGame.player.id,
      cardIds,
    })

    const state = await getPublicGameState({ gameId: singlePlayerGame.gameId })
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
    const actions = collectResolvedActions()
    const nextHand = new Promise<
      Parameters<ServerToClientEvents['cards.dealt']>[0]
    >((resolve) => client.once('cards.dealt', resolve))

    const result = await submitProgram({
      gameId: singlePlayerGame.gameId,
      playerId: singlePlayerGame.player.id,
      cardIds: selectedCards.map((card) => card.id),
    })

    expect(result).toEqual({ outcome: 'ACCEPTED' })
    expect(await submitted).toEqual({
      gameId: singlePlayerGame.gameId,
      playerId: singlePlayerGame.player.id,
    })
    expect(submittedToPlayer).toHaveBeenCalledExactlyOnceWith(await submitted)
    const resolvedActions = await actions
    expect(resolvedActions.map((action) => action.instruction)).toEqual([
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
    ])
    expect(await nextHand).toEqual(
      presentCardsDealt(singlePlayerGame.gameId, singlePlayerGame.player),
    )
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
    const valid = {
      gameId: singlePlayerGame.gameId,
      playerId: singlePlayerGame.player.id,
      cardIds,
    }
    const invalidPayloads: readonly unknown[] = [
      {},
      { ...valid, cardIds: cardIds.slice(0, 4) },
      {
        ...valid,
        cardIds: [cardIds[0], cardIds[0], ...cardIds.slice(2)],
      },
      {
        ...valid,
        cardIds: [
          ...cardIds.slice(0, 4),
          '00000000-0000-4000-8000-000000000999',
        ],
      },
      {
        ...valid,
        gameId: '00000000-0000-4000-8000-000000000999',
      },
      { ...valid, playerId: '00000000-0000-4000-8000-000000000999' },
      { ...valid, roundNumber: 2 },
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
