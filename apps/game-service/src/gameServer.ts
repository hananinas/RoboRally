import type { Server as HttpServer } from 'node:http'
import {
  parseGetPublicGameState,
  LoginRequestError,
  parseLogin,
  parseSubmitProgram,
  type ClientToServerEvents,
  type ProgramCardIds,
  type ServerToClientEvents,
  type User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import {
  createSinglePlayerGame,
  type Card,
  type Game,
  type Player,
} from './game/index.js'
import {
  presentCardsDealt,
  presentPhaseChanged,
  presentPublicGameState,
  presentRobotActionResolved,
} from './gamePresenter.js'
import { createUserRegistry } from './userRegistry.js'

export type GameSocketData = { user?: User }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type GameSession = Readonly<{
  gameId: string
  game: Game
  playerForConnection: (socket: GameSocket) => Player | undefined
}>

function defaultSession(): GameSession {
  const { gameId, game, player } = createSinglePlayerGame()
  return { gameId, game, playerForConnection: () => player }
}

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
  session: GameSession = defaultSession(),
): GameSocketServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>(httpServer)
  const users = createUserRegistry()
  const { gameId, game, playerForConnection } = session
  let publishedPhase = game.phase
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false

  // Submission and future membership handlers share this progression path.
  function advanceGame(): void {
    if (closed) return
    if (publishedPhase !== game.phase) {
      publishedPhase = game.phase
      io.to(publicRoom(gameId)).emit('game.phaseChanged', presentPhaseChanged(gameId, game))
      if (game.phase === 'programming') {
        for (const player of game.players) {
          io.to(playerRoom(gameId, player.id)).emit(
            'cards.dealt',
            presentCardsDealt(gameId, player),
          )
        }
      }
    }
    if (game.phase !== 'activation' || scheduledAction) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed) return
      if (game.phase === 'activation') {
        const result = game.executeNextAction()
        io.to(publicRoom(gameId)).emit(
          'robot.actionResolved',
          presentRobotActionResolved(gameId, result),
        )
      }
      advanceGame()
    })
  }

  httpServer.once('close', () => {
    closed = true
    clearImmediate(scheduledAction)
  })

  io.on('connection', (socket) => {
    const player = playerForConnection(socket)
    if (!player || !game.players.includes(player)) {
      socket.disconnect(true)
      return
    }
    socket.join([publicRoom(gameId), playerRoom(gameId, player.id)])

    socket.on('user.login', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      let username: string
      try {
        username = parseLogin(payload).username
      } catch (error) {
        acknowledge({
          outcome:
            error instanceof LoginRequestError ? error.outcome : 'INTERNAL_ERROR',
        })
        return
      }

      if (socket.data.user) {
        acknowledge(
          socket.data.user.username === username
            ? { outcome: 'LOGGED_IN', user: socket.data.user }
            : { outcome: 'ALREADY_LOGGED_IN' },
        )
        return
      }

      try {
        const user = users.findOrCreate(username)
        socket.data.user = user
        acknowledge({ outcome: 'LOGGED_IN', user })
      } catch {
        acknowledge({ outcome: 'INTERNAL_ERROR' })
      }
    })

    socket.on('game.getPublicGameState', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      try {
        const request = parseGetPublicGameState(payload)
        if (request.gameId === gameId) {
          acknowledge({
            outcome: 'GAME_FOUND',
            state: presentPublicGameState(gameId, game),
          })
          return
        }
      } catch {
        // Invalid requests receive the same non-disclosing result as unknown games.
      }

      acknowledge({ outcome: 'GAME_NOT_FOUND' })
    })

    socket.on('program.submit', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      try {
        const submission = parseSubmitProgram(payload)
        const program = resolveProgram(player, submission.cardIds)
        if (
          submission.gameId !== gameId ||
          submission.playerId !== player.id ||
          !program
        ) {
          throw new Error('Program does not belong to this game')
        }
        game.submitProgram(player.id, program)
      } catch {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }

      acknowledge({ outcome: 'ACCEPTED' })
      io.to(publicRoom(gameId)).emit('program.submitted', {
        gameId,
        playerId: player.id,
      })

      advanceGame()
    })

    socket.emit('cards.dealt', presentCardsDealt(gameId, player))
  })

  return io
}
