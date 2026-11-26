import { ok } from 'neverthrow'
import { emptyRequestSchema, type EmptyRequest, type MembershipResult, type User } from '@robo-rally/game-events'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { leaveLobby } from '@/socket/handlers/lobbyHandlers'
import { presentLobby } from '@/socket/presenters/lobbyPresenter'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { logError } from '@/logger'

function resolveLobbyMembership(context: SocketContext, socket: GameSocket, user: User): MembershipResult {
  const lobbySession = context.registry.getCurrentLobby(user.userId)
  if (!lobbySession) throw new Error('Membership references a missing lobby')
  return lobbySession.reattach(socket)
    ? { outcome: 'IN_LOBBY', lobby: presentLobby(lobbySession.lobby), user }
    : { outcome: 'ALREADY_HAS_MEMBERSHIP' }
}

function resolveGameMembership(context: SocketContext, socket: GameSocket, user: User): {
  result: MembershipResult
  announceReconnected: () => void
} {
  const gameSession = context.registry.getCurrentGame(user.userId)
  if (!gameSession) throw new Error('Membership references a missing game')
  const result = gameSession.reattach(socket)
  if (result.isErr()) return { result: { outcome: result.error }, announceReconnected: () => {} }
  const { initialization, announceReconnected } = result.value
  return { result: { outcome: 'IN_GAME', initialization, user }, announceReconnected }
}

export function handleGetMembership(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: MembershipResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'membership.get', schema: emptyRequestSchema, payload, acknowledge,
    resolve: (user) => ok(user),
    run: (user, ack) => {
      const membership = context.registry.getActiveMembership(user.userId)
      if (!membership) return ack({ outcome: 'NO_MEMBERSHIP', user })
      if (membership.kind === 'lobby') return ack(resolveLobbyMembership(context, socket, user))
      const { result, announceReconnected } = resolveGameMembership(context, socket, user)
      ack(result)
      announceReconnected()
    },
  })
}

export function handleSocketDisconnect(context: SocketContext, socket: GameSocket): void {
  try {
    const { userId } = socket.data.user
    const lobbySession = context.registry.getCurrentLobby(userId)
    if (lobbySession) {
      lobbySession.deferLeave(socket, () => {
        if (context.registry.getCurrentLobby(userId) === lobbySession) leaveLobby(context, socket)
      })
      return
    }
    const gameSession = context.registry.getCurrentGame(userId)
    if (gameSession) gameSession.markDisconnected(socket)
  } catch (error) {
    logError('Failed to clean up disconnected socket', error, { userId: socket.data.user.userId })
  }
}
