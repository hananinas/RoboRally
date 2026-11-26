import { ok } from 'neverthrow'
import { emptyRequestSchema, type ClockResult, type EmptyRequest } from '@robo-rally/game-events'
import type { GameSocket } from '@/socket/gameServer'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'

export function handleClockGet(
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: ClockResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'clock.get', schema: emptyRequestSchema, payload, acknowledge,
    resolve: (user) => ok(user),
    run: (_user, ack) => {
      ack({ outcome: 'CLOCK', serverTime: Date.now() })
    },
  })
}
