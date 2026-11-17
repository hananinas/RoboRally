import { handleListLobbies, handleCreateLobby, handleJoinLobby, handleLeaveLobby, handleStartLobby } from '@/socket/handlers/lobbyHandlers'
import { handleGetMembership, handleLeaveGame, handleSocketDisconnect, handleCurrentGameProgram, handleCurrentGameRegisters, recoverSocketSession, validateSocketSession } from '@/socket/handlers/membershipHandlers'
import { MembershipRegistry } from '@/membership/MembershipRegistry'
import type { Server as HttpServer } from 'node:http'
import { emptyRequestSchema } from '@robo-rally/game-events'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import { parseCookie } from 'cookie'
import { SESSION_COOKIE_NAME, type Session, type SessionStore } from '@/auth/sessionStore'
import { createAuthGatedAdapter } from '@/socket/authGatedAdapter'

export type GameSocketData = { user: User; authSession: Session; sessionId: string }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type SocketContext = { io: GameSocketServer; registry: MembershipRegistry }

function authenticateSocket(sessionStore: SessionStore, socket: GameSocket, next: (error?: Error) => void): void {
  const cookies = parseCookie(socket.handshake.headers.cookie ?? '')
  const sessionId = cookies[SESSION_COOKIE_NAME]
  if (!sessionId) {
    next(new Error('UNAUTHENTICATED'))
    return
  }
  const authSession = sessionStore.get(sessionId)
  if (!authSession) {
    next(new Error('UNAUTHENTICATED'))
    return
  }
  if (socket.recovered && socket.data.authSession?.sub !== authSession.sub) {
    next(new Error('SESSION_MISMATCH'))
    return
  }
  socket.data.sessionId = sessionId
  socket.data.authSession = authSession
  socket.data.user = { userId: authSession.sub, username: authSession.username }
  next()
}

function rejectExpiredSession(sessionStore: SessionStore, socket: GameSocket, next: (error?: Error) => void): void {
  if (sessionStore.get(socket.data.sessionId)) {
    next()
    return
  }
  socket.disconnect(true)
  next(new Error('UNAUTHENTICATED'))
}

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

    socket.on('clock.get', (payload, ack) => {
      if (typeof ack !== 'function') return
      if (!emptyRequestSchema.safeParse(payload).success) return ack({ outcome: 'INVALID_REQUEST' })
      ack({ outcome: 'CLOCK', serverTime: Date.now() })
    })

    socket.on('lobby.list', (payload, ack) => handleListLobbies(context, socket, payload, ack))
    socket.on('lobby.create', (payload, ack) => handleCreateLobby(context, socket, payload, ack))
    socket.on('lobby.join', (payload, ack) => handleJoinLobby(context, socket, payload, ack))
    socket.on('lobby.leave', (payload, ack) => handleLeaveLobby(context, socket, payload, ack))
    socket.on('lobby.start', (payload, ack) => handleStartLobby(context, socket, payload, ack))
    socket.on('membership.get', (payload, ack) => handleGetMembership(context, socket, payload, ack))

    socket.on('game.leave', (payload, ack) => handleLeaveGame(context, socket, payload, ack))
    socket.on('disconnect', () => handleSocketDisconnect(context, socket))
    socket.on('program.submit', (payload, ack) => handleCurrentGameProgram(context, socket, payload, ack))
    socket.on('game.updateRegisters', (payload, ack) => handleCurrentGameRegisters(context, socket, payload, ack))
  })

  return io
}
