import { parseCookie } from 'cookie'
import { SESSION_COOKIE_NAME, type SessionStore } from '@/auth/sessionStore'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { logError } from '@/logger'

export function authenticateSocket(sessionStore: SessionStore, socket: GameSocket, next: (error?: Error) => void): void {
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

export function rejectExpiredSession(sessionStore: SessionStore, socket: GameSocket, next: (error?: Error) => void): void {
  if (sessionStore.get(socket.data.sessionId)) {
    next()
    return
  }
  socket.disconnect(true)
  next(new Error('UNAUTHENTICATED'))
}

export function validateSocketSession(context: SocketContext, socket: GameSocket, next: (error?: Error) => void): void {
  if (socket.recovered) {
    const gameSession = context.registry.getCurrentGame(socket.data.user.userId)
    const seat = gameSession?.getSeat(socket.data.user.userId)
    if (seat?.connectionId && seat.connectionId !== socket.id) {
      return next(new Error('USER_ALREADY_IN_GAME'))
    }
    const expectedRooms = new Set(seat && gameSession
      ? [socket.id, gameSession.publicRoom, gameSession.playerRoom(seat.player.id)] : [socket.id])
    if ([...socket.rooms].some((room) => !expectedRooms.has(room))) {
      return next(new Error('SOCKET_SESSION_EXPIRED'))
    }
  }
  next()
}

export function recoverSocketSession(context: SocketContext, socket: GameSocket): void {
  const gameSession = context.registry.getCurrentGame(socket.data.user.userId)
  if (!gameSession) return
  try {
    gameSession.reconnectIfRecovered(socket)
  } catch (error) {
    logError('Failed to recover socket session', error, {
      userId: socket.data.user.userId, gameId: gameSession.game.id,
    })
  }
}
