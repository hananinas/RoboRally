import { parseCookie } from 'cookie'
import { SESSION_COOKIE_NAME, type SessionStore } from '@/auth/sessionStore'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import type { MembershipRegistry } from '@/membership/MembershipRegistry'
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

export function recoveryError(registry: MembershipRegistry, userId: string, socketId: string, rooms: Iterable<string>) {
  const gameSession = registry.getCurrentGame(userId)
  const seat = gameSession?.getSeat(userId)
  if (seat?.connectionId && seat.connectionId !== socketId) return 'USER_ALREADY_IN_GAME'
  const expectedRooms = new Set(seat && gameSession
    ? [socketId, gameSession.publicRoom, gameSession.playerRoom(seat.player.id)] : [socketId])
  if ([...rooms].some((room) => !expectedRooms.has(room))) return 'SOCKET_SESSION_EXPIRED'
  return undefined
}

export function validateSocketSession(context: SocketContext, socket: GameSocket, next: (error?: Error) => void): void {
  const error = socket.recovered && recoveryError(context.registry, socket.data.user.userId, socket.id, socket.rooms)
  next(error ? new Error(error) : undefined)
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
