import { emptyRequestSchema, type EmptyRequest, type SessionResult } from '@robo-rally/game-events'
import type { GameSocket } from '@/socket/gameServer'
import type { SessionContext } from '@/socket/sessionContext'
import { presentLobby } from '@/socket/handlers/lobbyHandlers'
import { handleReattachGame } from '@/socket/handlers/membershipHandlers'
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
