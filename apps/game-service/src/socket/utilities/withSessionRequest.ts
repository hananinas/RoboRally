import { emptyRequestSchema, lobbyRequestSchema, type LobbyFailure, type User } from '@robo-rally/game-events'
import { logError, logWarn } from '@/logger'
import type { GameSocket } from '@/socket/gameServer'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'

export function withSessionRequest<R>(
  socket: GameSocket,
  command: string,
  schema: typeof emptyRequestSchema | typeof lobbyRequestSchema,
  payload: unknown,
  acknowledge: (result: R | LobbyFailure) => void,
  run: (user: User, ack: (result: R | LobbyFailure) => void) => void,
): void {
  withAcknowledgeOnce<R | LobbyFailure>(acknowledge, (ack) => {
    const user = socket.data.user
    const parsed = schema.safeParse(payload)
    if (!user || !parsed.success) {
      const outcome = user ? 'INVALID_REQUEST' : 'LOGIN_REQUIRED'
      logWarn(`Rejected ${command} request`, { command, outcome, payload })
      ack({ outcome })
      return
    }
    run(user, ack)
  }, (error) => {
    logError(`Failed to process ${command}`, error, { command, payload })
    return { outcome: 'INTERNAL_ERROR' }
  })
}
