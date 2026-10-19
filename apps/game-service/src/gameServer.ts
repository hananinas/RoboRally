import type { Server as HttpServer } from 'node:http'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import type { Game } from '@/game/index'
import { presentPublicGameState } from '@/gamePresenter'
import { createUserRegistry } from '@/userRegistry'
import { createSharedGame } from '@/game/GameFactory'
import { createActionScheduler } from '@/actionScheduler'
import { handleLogin } from '@/authHandlers'
import {
  handleDisconnect,
  handleGetLobbyDetails,
  handleGetPublicGameState,
  handleJoin,
  handleLeave,
  reconnectIfRecovered,
  type GameMembership,
  type MembershipContext,
} from '@/membershipHandlers'
import { handleSubmitProgram } from '@/gameplayHandlers'

export type GameSocketData = { user?: User }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type GameSession = Readonly<{ gameId: string; game: Game }>

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
    socket.on('game.getLobbyDetails', (payload, acknowledge) =>
      handleGetLobbyDetails(membershipContext, socket, payload, acknowledge))
    socket.on('game.getPublicGameState', (payload, acknowledge) =>
      handleGetPublicGameState(membershipContext, socket, payload, acknowledge))
    socket.on('program.submit', (payload, acknowledge) =>
      handleSubmitProgram(membershipContext, socket, payload, acknowledge))
  })

  return io
}
