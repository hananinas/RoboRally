import type { Server as HttpServer } from 'node:http'
import {
  parseSubmitProgram,
  type ClientToServerEvents,
  type ProgramCardIds,
  type ServerToClientEvents,
} from '@robo-rally/game-events'
import { Server } from 'socket.io'
import {
  createSinglePlayerGame,
  type Card,
  type Player,
  type SinglePlayerGame,
} from './game/index.js'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
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

function resolveProgram(
  player: Player,
  cardIds: ProgramCardIds,
): readonly Card[] | undefined {
  const hand = new Map(player.hand.map((card) => [card.id, card]))
  const program: Card[] = []
  for (const cardId of cardIds) {
    const card = hand.get(cardId)
    if (!card) return undefined
    program.push(card)
  }
  return program
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
      if (payload.gameId !== gameId) {
        acknowledge({ outcome: 'GAME_NOT_FOUND' })
        return
      }
      acknowledge({
        outcome: 'FOUND',
        state: presentPublicGameState(gameId, game),
      })
    })

    socket.on('program.submit', (payload, acknowledge) => {
      try {
        const submission = parseSubmitProgram(payload)
        const program = resolveProgram(player, submission.cardIds)
        if (submission.gameId !== gameId || !program) {
          throw new Error('Program does not belong to this game')
        }
        game.submitProgram(player.id, program)
      } catch {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }

      acknowledge({ outcome: 'ACCEPTED' })
      io.to(publicRoom(gameId)).emit('program.submitted', {
        playerId: player.id,
      })

      for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
        const result = game.executeCurrentRegister()
        for (const action of result.actions) {
          io.to(publicRoom(gameId)).emit(
            'robot.actionResolved',
            presentRobotActionResolved(game, action),
          )
        }
      }

      io.to(playerRoom(gameId, player.id)).emit(
        'cards.dealt',
        presentCardsDealt(player),
      )
    })

    socket.emit('cards.dealt', presentCardsDealt(player))
  })

  return io
}
