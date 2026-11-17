import { emptyRequestSchema, type EmptyRequest, type SessionResult, type LeaveResult, type SubmitProgram, type ProgramResult, type UpdateRegisters, type UpdateRegistersResult } from '@robo-rally/game-events'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { presentLobby, leaveLobby } from '@/socket/handlers/lobbyHandlers'
import { handleReattachGame, handleLeave, handleDisconnect, reconnectIfRecovered } from '@/socket/handlers/membershipHandlers'
import { handleSubmitProgram, handleUpdateRegisters } from '@/socket/handlers/gameplayHandlers'
import { withSessionRequest } from '@/socket/utilities/withSessionRequest'

export function handleGetSession(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: SessionResult) => void,
): void {
  withSessionRequest(socket, 'session.get', emptyRequestSchema, payload, acknowledge, (user, ack) => {
    const membership = context.registry.getActiveMembership(user.userId)
    if (!membership) return ack({ outcome: 'NO_SESSION', user })
    if (membership.kind === 'lobby') {
      const lobby = context.registry.getCurrentLobby(user.userId)
      if (!lobby) throw new Error('Session references a missing lobby')
      return ack(lobby.getMember(user.userId)?.connectionId === socket.id
        ? { outcome: 'IN_LOBBY', lobby: presentLobby(lobby), user }
        : { outcome: 'USER_ALREADY_IN_SESSION' })
    }
    const game = context.registry.getCurrentGame(user.userId)
    if (!game) throw new Error('Session references a missing game')
    handleReattachGame(game, socket, ack)
  })
}

export function validateRecoveredSession(context: SocketContext, socket: GameSocket, next: (error?: Error) => void): void {
  if (socket.recovered) {
    const ctx = context.registry.getCurrentGame(socket.data.user.userId)
    const membership = ctx?.memberships.get(socket.data.user.userId)
    if (membership?.connectionId && membership.connectionId !== socket.id) {
      return next(new Error('USER_ALREADY_IN_GAME'))
    }
    const expectedRooms = new Set(membership && ctx
      ? [socket.id, ctx.publicRoom, ctx.playerRoom(membership.player.id)] : [socket.id])
    if ([...socket.rooms].some((room) => !expectedRooms.has(room))) {
      return next(new Error('SESSION_EXPIRED'))
    }
  }
  next()
}

export function recoverSession(context: SocketContext, socket: GameSocket): void {
  const game = context.registry.getCurrentGame(socket.data.user.userId)
  if (game) reconnectIfRecovered(game, socket)
}

export function handleLeaveGame(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LeaveResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const game = context.registry.getCurrentGame(socket.data.user.userId)
  if (!game) return acknowledge({ outcome: 'GAME_NOT_FOUND' })
  handleLeave(game, socket, payload, (result) => {
    if (result.outcome === 'LEFT') context.registry.clearActiveMembership(socket.data.user.userId)
    acknowledge(result)
  })
  if (game.memberships.size === 0) {
    game.actionScheduler.stop()
    context.registry.removeGame(game.game.id)
  }
}

export function handleDisconnectSession(context: SocketContext, socket: GameSocket): void {
  leaveLobby(context, socket)
  const game = context.registry.getCurrentGame(socket.data.user.userId)
  if (game) handleDisconnect(game, socket)
}

export function handleSessionProgram(
  context: SocketContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: (result: ProgramResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const game = context.registry.getCurrentGame(socket.data.user.userId)
  if (game) handleSubmitProgram(game, socket, payload, acknowledge)
  else acknowledge({ outcome: 'NOT_A_MEMBER' })
}

export function handleSessionRegisters(
  context: SocketContext,
  socket: GameSocket,
  payload: UpdateRegisters,
  acknowledge: (result: UpdateRegistersResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const game = context.registry.getCurrentGame(socket.data.user.userId)
  if (game) handleUpdateRegisters(game, socket, payload, acknowledge)
  else acknowledge({ outcome: 'NOT_A_MEMBER' })
}
