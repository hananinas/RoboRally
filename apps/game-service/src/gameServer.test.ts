import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@robo-rally/game-events'
import {
  io as createSocketClient,
  type Socket as ClientSocket,
} from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
})
