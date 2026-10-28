import { emptyRequestSchema, type EmptyRequest, type SessionResult, type LeaveGame, type LeaveResult, type SubmitProgram, type ProgramResult, type UpdateRegisters, type UpdateRegistersResult } from '@robo-rally/game-events'
import type { GameSocket } from '@/socket/gameServer'
import { currentGame, type SessionContext } from '@/socket/sessionContext'
import { presentLobby, leaveLobby } from '@/socket/handlers/lobbyHandlers'
import { handleReattachGame, handleLeave, handleDisconnect, reconnectIfRecovered } from '@/socket/handlers/membershipHandlers'
import { handleSubmitProgram, handleUpdateRegisters } from '@/socket/handlers/gameplayHandlers'
import { withSessionRequest } from '@/socket/utilities/withSessionRequest'

export function handleGetSession(
  context: SessionContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: SessionResult) => void,
): void {
  withSessionRequest(socket, 'session.get', emptyRequestSchema, payload, acknowledge, (user, ack) => {
    const session = context.sessionsByUser.get(user.userId)
    if (!session) return ack({ outcome: 'NO_SESSION' })
    if (session.kind === 'lobby') {
      const lobby = context.lobbies.get(session.lobbyId)
      if (!lobby) throw new Error('Session references a missing lobby')
      return ack(lobby.members.get(user.userId)?.connectionId === socket.id
        ? { outcome: 'IN_LOBBY', lobby: presentLobby(lobby) }
        : { outcome: 'USER_ALREADY_IN_SESSION' })
    }
    const game = context.games.get(session.gameId)
    if (!game) throw new Error('Session references a missing game')
    handleReattachGame(game, socket, ack)
  })
}

export function recoverSession(context: SessionContext, socket: GameSocket): void {
  const game = currentGame(context, socket)
  if (game) reconnectIfRecovered(game, socket)
}

export function handleLeaveGame(
  context: SessionContext,
  socket: GameSocket,
  payload: LeaveGame,
  acknowledge: (result: LeaveResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const game = currentGame(context, socket)
  if (!game) return acknowledge({ outcome: socket.data.user ? 'GAME_NOT_FOUND' : 'LOGIN_REQUIRED' })
  handleLeave(game, socket, payload, (result) => {
    if (result.outcome === 'LEFT') context.sessionsByUser.delete(socket.data.user!.userId)
    acknowledge(result)
  })
  if (game.memberships.size === 0) {
    game.actionScheduler.stop()
    context.games.delete(game.gameId)
  }
}

export function handleDisconnectSession(context: SessionContext, socket: GameSocket): void {
  leaveLobby(context, socket)
  const game = currentGame(context, socket)
  if (game) handleDisconnect(game, socket)
}

export function handleSessionProgram(
  context: SessionContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: (result: ProgramResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const game = currentGame(context, socket)
  if (game) handleSubmitProgram(game, socket, payload, acknowledge)
  else acknowledge({ outcome: 'NOT_A_MEMBER' })
}

export function handleSessionRegisters(
  context: SessionContext,
  socket: GameSocket,
  payload: UpdateRegisters,
  acknowledge: (result: UpdateRegistersResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const game = currentGame(context, socket)
  if (game) handleUpdateRegisters(game, socket, payload, acknowledge)
  else acknowledge({ outcome: 'NOT_A_MEMBER' })
}
