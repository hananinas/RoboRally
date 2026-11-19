import type { ZodType } from 'zod'
import type { Result } from 'neverthrow'
import type { User } from '@robo-rally/game-events'
import { logError, logWarn } from '@/logger'
import type { GameSocket } from '@/socket/gameServer'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'

export type RequestFailure = Readonly<{ outcome: 'INVALID_REQUEST' | 'INTERNAL_ERROR' }>

export function withValidatedRequest<T, Resolved, F, R>({
  socket,
  command,
  schema,
  payload,
  resolve,
  acknowledge,
  run,
}: {
  socket: GameSocket
  command: string
  schema: ZodType<T>
  payload: unknown
  resolve: (user: User, data: T) => Result<Resolved, F>
  acknowledge: (result: R | RequestFailure | F) => void
  run: (resolved: Resolved, ack: (result: R | RequestFailure | F) => void) => void
}): void {
  withAcknowledgeOnce<R | RequestFailure | F>(acknowledge, (ack) => {
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      logWarn(`Rejected ${command} request`, { command, outcome: 'INVALID_REQUEST', payload })
      ack({ outcome: 'INVALID_REQUEST' })
      return
    }
    const resolved = resolve(socket.data.user, parsed.data)
    if (resolved.isErr()) {
      logWarn(`Rejected ${command} request`, { command, payload, result: resolved.error })
      ack(resolved.error)
      return
    }
    run(resolved.value, ack)
  }, (error) => {
    logError(`Failed to process ${command}`, error, { command, payload })
    return { outcome: 'INTERNAL_ERROR' }
  })
}
