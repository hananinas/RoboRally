import type { Server as HttpServer } from 'node:http'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@robo-rally/game-events'
import { Server } from 'socket.io'
import {
  createSinglePlayerGame,
  type SinglePlayerGame,
} from './game/index.js'
import {
  presentCardsDealt,
  presentPublicGameState,
} from './gamePresenter.js'

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents
>

function publicRoom(gameId: string): string {
  return `game:${gameId}:public`
}

function playerRoom(gameId: string, playerId: string): string {
  return `game:${gameId}:player:${playerId}`
}

export function createGameSocketServer(
  httpServer: HttpServer,
  singlePlayerGame: SinglePlayerGame = createSinglePlayerGame(),
): GameSocketServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer)
  const { gameId, game, player } = singlePlayerGame

  io.on('connection', (socket) => {
    socket.join([publicRoom(gameId), playerRoom(gameId, player.id)])

    socket.on('game.getPublicGameState', (payload, acknowledge) => {
      if (payload.gameId !== gameId) return
      acknowledge(presentPublicGameState(gameId, game))
    })

    socket.emit('cards.dealt', presentCardsDealt(player))
  })

  return io
}
