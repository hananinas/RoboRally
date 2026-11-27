import { handleListLobbies, handleCreateLobby, handleJoinLobby, handleSelectRobot, handleLeaveLobby, handleStartLobby } from '@/socket/handlers/lobbyHandlers'
import { handleGetMembership, handleSocketDisconnect } from '@/socket/handlers/membershipHandlers'
import { handleLeaveGame, handleSubmitProgram, handleUpdateRegisters, handleVote } from '@/socket/handlers/gameHandlers'
import { handleClockGet } from '@/socket/handlers/clockHandlers'
import { authenticateSocket, rejectExpiredSession, validateSocketSession, recoverSocketSession } from '@/socket/connection/socketConnection'
import { MembershipRegistry } from '@/membership/MembershipRegistry'
import type { Server as HttpServer } from 'node:http'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import type { Session, SessionStore } from '@/auth/sessionStore'
import { createAuthGatedAdapter } from '@/socket/connection/authGatedAdapter'

export type GameSocketData = { user: User; authSession: Session; sessionId: string }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type SocketContext = { io: GameSocketServer; registry: MembershipRegistry }

export function createGameSocketServer(
  httpServer: HttpServer,
  sessionStore: SessionStore,
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
    adapter: createAuthGatedAdapter(sessionStore),
  })
  const context: SocketContext = { io, registry: new MembershipRegistry() }
  httpServer.once('close', () => { for (const ctx of context.registry.games) ctx.actionScheduler.stop() })

  io.use((socket, next) => authenticateSocket(sessionStore, socket, next))

  io.use((socket, next) => validateSocketSession(context, socket, next))

  io.on('connection', (socket) => {
    socket.use((_event, next) => rejectExpiredSession(sessionStore, socket, next))

    recoverSocketSession(context, socket)

    socket.on('clock.get', (payload, ack) => handleClockGet(socket, payload, ack))

    socket.on('lobby.list', (payload, ack) => handleListLobbies(context, socket, payload, ack))
    socket.on('lobby.create', (payload, ack) => handleCreateLobby(context, socket, payload, ack))
    socket.on('lobby.join', (payload, ack) => handleJoinLobby(context, socket, payload, ack))
    socket.on('lobby.selectRobot', (payload, ack) => handleSelectRobot(context, socket, payload, ack))
    socket.on('lobby.leave', (payload, ack) => handleLeaveLobby(context, socket, payload, ack))
    socket.on('lobby.start', (payload, ack) => handleStartLobby(context, socket, payload, ack))
    socket.on('membership.get', (payload, ack) => handleGetMembership(context, socket, payload, ack))

    socket.on('game.vote', (payload, ack) => handleVote(context, socket, payload, ack))
    socket.on('game.leave', (payload, ack) => handleLeaveGame(context, socket, payload, ack))
    socket.on('disconnect', () => handleSocketDisconnect(context, socket))
    socket.on('program.submit', (payload, ack) => handleSubmitProgram(context, socket, payload, ack))
    socket.on('game.updateRegisters', (payload, ack) => handleUpdateRegisters(context, socket, payload, ack))
  })

  return io
}
