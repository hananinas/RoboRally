import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  ClientToServerEvents,
  ProgramResult,
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
  let singlePlayerGame: SinglePlayerGame

  beforeEach(async () => {
    singlePlayerGame = createSinglePlayerGame()
    httpServer = createServer()
    io = createGameSocketServer(httpServer, singlePlayerGame)
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const { port } = httpServer.address() as AddressInfo
    client = createSocketClient(`http://127.0.0.1:${port}`, {
      autoConnect: false,
      transports: ['websocket'],
    })
  })

  afterEach(async () => {
    client.disconnect()
    await new Promise<void>((resolve, reject) =>
      io.close((error) => (error ? reject(error) : resolve())),
    )
  })

  function connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
      client.connect()
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

  it('acknowledges the current public game state', async () => {
    await connect()

    const state = await client.timeout(1_000).emitWithAck(
      'game.getPublicGameState',
      { gameId: singlePlayerGame.gameId },
    )

    expect(state).toEqual(
      presentPublicGameState(singlePlayerGame.gameId, singlePlayerGame.game),
    )
  })

  it('accepts an ordered program, executes five registers, and starts the next round', async () => {
    const initialHand = new Promise<
      Parameters<ServerToClientEvents['cards.dealt']>[0]
    >((resolve) => client.once('cards.dealt', resolve))
    await connect()
    await initialHand

    const selectedCards = singlePlayerGame.player.hand.slice(0, 5)
    const submitToGame = vi.spyOn(singlePlayerGame.game, 'submitProgram')
    const submitted = new Promise<
      Parameters<ServerToClientEvents['program.submitted']>[0]
    >((resolve) => client.once('program.submitted', resolve))
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
    expect(nextState.phase).toBe('PROGRAMMING')
    expect(nextState.robots[0].position).toEqual(resolvedActions.at(-1)?.position)
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
