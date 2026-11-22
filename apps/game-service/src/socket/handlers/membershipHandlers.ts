import { ok } from 'neverthrow'
import { emptyRequestSchema, type EmptyRequest, type MembershipResult, type User } from '@robo-rally/game-events'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { leaveLobby } from '@/socket/handlers/lobbyHandlers'
import { presentLobby } from '@/socket/presenters/lobbyPresenter'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'

function resolveLobbyMembership(context: SocketContext, socket: GameSocket, user: User): MembershipResult {
  const lobbySession = context.registry.getCurrentLobby(user.userId)
  if (!lobbySession) throw new Error('Membership references a missing lobby')
  return lobbySession.isMember(socket).isOk()
    ? { outcome: 'IN_LOBBY', lobby: presentLobby(lobbySession.lobby), user }
    : { outcome: 'ALREADY_HAS_MEMBERSHIP' }
}

function resolveGameMembership(context: SocketContext, socket: GameSocket, user: User): MembershipResult {
  const gameSession = context.registry.getCurrentGame(user.userId)
  if (!gameSession) throw new Error('Membership references a missing game')
  const result = gameSession.reattach(socket)
  return result.isOk() ? { outcome: 'IN_GAME', initialization: result.value, user } : { outcome: result.error }
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
      ack(membership.kind === 'lobby' ? resolveLobbyMembership(context, socket, user) : resolveGameMembership(context, socket, user))
    },
  })
}

export function handleSocketDisconnect(context: SocketContext, socket: GameSocket): void {
  leaveLobby(context, socket)
  const gameSession = context.registry.getCurrentGame(socket.data.user.userId)
  if (gameSession) gameSession.markDisconnected(socket)
}
