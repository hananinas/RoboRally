import { handleListLobbies, handleCreateLobby, handleJoinLobby, handleLeaveLobby, handleStartLobby } from '@/socket/handlers/lobbyHandlers'
import { handleGetSession, handleLeaveGame, handleDisconnectSession, handleSessionProgram, handleSessionRegisters, recoverSession, validateRecoveredSession } from '@/socket/handlers/sessionHandlers'
import type { SessionContext } from '@/socket/sessionContext'
import type { Server as HttpServer } from 'node:http'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import { parseCookie } from 'cookie'
import type { Game } from '@/game/index'
import { createDefaultGame } from '@/game/GameFactory'
import { SESSION_COOKIE_NAME, type Session, type SessionStore } from '@/auth/sessionStore'

export type GameSocketData = { user: User; authSession: Session }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type GameSession = Readonly<{ gameId: string; game: Game }>

function authenticateSocket(sessionStore: SessionStore, socket: GameSocket, next: (error?: Error) => void): void {
  const cookies = parseCookie(socket.handshake.headers.cookie ?? '')
  const sessionId = cookies[SESSION_COOKIE_NAME]
  const authSession = sessionId ? sessionStore.get(sessionId) : undefined
  if (!authSession) {
    next(new Error('UNAUTHENTICATED'))
    return
  }
  if (socket.recovered && socket.data.authSession?.sub !== authSession.sub) {
    next(new Error('SESSION_MISMATCH'))
    return
  }
  socket.data.authSession = authSession
  socket.data.user = { userId: authSession.sub, username: authSession.username }
  next()
}

export function createGameSocketServer(
  httpServer: HttpServer,
  sessionStore: SessionStore,
  createGame: () => GameSession = createDefaultGame,
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
  const context: SessionContext = {
    io, createGame, games: new Map(), lobbies: new Map(), sessionsByUser: new Map(),
  }
  httpServer.once('close', () => { for (const ctx of context.games.values()) ctx.actionScheduler.stop() })

  io.use((socket, next) => authenticateSocket(sessionStore, socket, next))

  io.use((socket, next) => validateRecoveredSession(context, socket, next))

  io.on('connection', (socket) => {
    recoverSession(context, socket)

    socket.on('lobby.list', (payload, ack) => handleListLobbies(context, socket, payload, ack))
    socket.on('lobby.create', (payload, ack) => handleCreateLobby(context, socket, payload, ack))
    socket.on('lobby.join', (payload, ack) => handleJoinLobby(context, socket, payload, ack))
    socket.on('lobby.leave', (payload, ack) => handleLeaveLobby(context, socket, payload, ack))
    socket.on('lobby.start', (payload, ack) => handleStartLobby(context, socket, payload, ack))
    socket.on('session.get', (payload, ack) => handleGetSession(context, socket, payload, ack))

    socket.on('game.leave', (payload, ack) => handleLeaveGame(context, socket, payload, ack))
    socket.on('disconnect', () => handleDisconnectSession(context, socket))
    socket.on('program.submit', (payload, ack) => handleSessionProgram(context, socket, payload, ack))
    socket.on('game.updateRegisters', (payload, ack) => handleSessionRegisters(context, socket, payload, ack))
  })

  return io
}
