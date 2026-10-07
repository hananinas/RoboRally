import type { Server as HttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  parseSubmitProgram,
  type ClientToServerEvents,
  type ProgramCardIds,
  type ServerToClientEvents,
  type User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import {
  type Card,
  type Game,
  type Player,
} from '@/game/index'
import { presentPublicGameState } from '@/gamePresenter'
import { createUserRegistry } from '@/userRegistry'
import { createSharedGame } from '@/game/SinglePlayerGame'
import { createActionScheduler } from '@/actionScheduler'
import { handleLogin } from '@/authHandlers'
import {
  handleDisconnect,
  handleGetPublicGameState,
  handleJoin,
  handleLeave,
  ownedMembership,
  reconnectIfRecovered,
  type GameMembership,
  type MembershipContext,
} from '@/membershipHandlers'

export type GameSocketData = { user?: User }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type GameSession = Readonly<{ gameId: string; game: Game }>

function resolveProgram(
  player: Player,
  cardIds: ProgramCardIds,
): readonly Card[] | undefined {
  const hand = player.hand
  const program = cardIds.map((id) => hand.find((card) => card.id === id))
  return program.every((card) => card !== undefined) ? program : undefined
}

export function createGameSocketServer(
  httpServer: HttpServer,
  sharedGame: GameSession = createSharedGame(),
): GameSocketServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    {},
    GameSocketData
  >(httpServer, {
    connectionStateRecovery: { skipMiddlewares: false },
    pingInterval: 1000,
    pingTimeout: 1000,
  })
  const users = createUserRegistry()
  const { gameId, game } = sharedGame
  const publicRoom = `game:${gameId}:public`
  const playerRoom = (playerId: string) => `game:${gameId}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()
  const actionScheduler = createActionScheduler({ io, game, gameId, publicRoom, playerRoom })

  const publicState = () => presentPublicGameState(gameId, game,
    [...memberships.values()].map(({ user, player, connectionId }) => ({
      playerId: player.id,
      username: user.username,
      programSubmitted: game.hasSubmittedProgram(player.id),
      connected: connectionId !== null,
    })),
  )

  const membershipContext: MembershipContext = {
    io, game, gameId, publicRoom, playerRoom, memberships, publicState, actionScheduler,
  }

  httpServer.once('close', actionScheduler.stop)

  io.use((socket, next) => {
    if (socket.recovered && socket.data.user) {
      const membership = memberships.get(socket.data.user.userId)
      if (membership?.connectionId && membership.connectionId !== socket.id) {
        next(new Error('USER_ALREADY_IN_GAME'))
        return
      }
    }
    next()
  })

  io.on('connection', (socket) => {
    socket.on('user.login', (payload, acknowledge) => handleLogin(socket, { users }, payload, acknowledge))

    reconnectIfRecovered(membershipContext, socket)

    socket.on('game.join', (payload, acknowledge) => handleJoin(membershipContext, socket, payload, acknowledge))
    socket.on('game.leave', (payload, acknowledge) => handleLeave(membershipContext, socket, payload, acknowledge))
    socket.on('disconnect', () => handleDisconnect(membershipContext, socket))
    socket.on('game.getPublicGameState', (payload, acknowledge) =>
      handleGetPublicGameState(membershipContext, socket, payload, acknowledge))

    socket.on('program.submit', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const player = ownedMembership(membershipContext, socket)?.player
      if (!player) {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }
      if (game.paused) {
        acknowledge({ outcome: 'GAME_PAUSED' })
        return
      }

      try {
        const submission = parseSubmitProgram(payload)
        const program = resolveProgram(player, submission.cardIds)
        if (submission.gameId !== gameId || submission.playerId !== player.id || !program) {
          throw new Error('Program does not belong to this game')
        }
        game.submitProgram(player.id, program)
      } catch {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }

      acknowledge({ outcome: 'ACCEPTED' })
      socket.to(publicRoom).emit('program.submitted', {
        gameId,
        playerId: player.id,
      })

      actionScheduler.scheduleNextAction()
    })
  })

  return io
}
