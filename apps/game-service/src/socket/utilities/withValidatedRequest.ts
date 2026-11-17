import { createLobbyRequestSchema, emptyRequestSchema, lobbyRequestSchema, type LobbyFailure, type User } from '@robo-rally/game-events'
import { logError, logWarn } from '@/logger'
import type { GameSocket } from '@/socket/gameServer'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'

export function withValidatedRequest<R>(
  socket: GameSocket,
  command: string,
  schema: typeof emptyRequestSchema | typeof lobbyRequestSchema | typeof createLobbyRequestSchema,
  payload: unknown,
  acknowledge: (result: R | LobbyFailure) => void,
  run: (user: User, ack: (result: R | LobbyFailure) => void) => void,
): void {
  withAcknowledgeOnce<R | LobbyFailure>(acknowledge, (ack) => {
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      logWarn(`Rejected ${command} request`, { command, outcome: 'INVALID_REQUEST', payload })
      ack({ outcome: 'INVALID_REQUEST' })
      return
    }
    run(socket.data.user, ack)
  }, (error) => {
    logError(`Failed to process ${command}`, error, { command, payload })
    return { outcome: 'INTERNAL_ERROR' }
  })
}
