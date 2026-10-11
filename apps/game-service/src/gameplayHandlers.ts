import {
  submitProgramSchema,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
} from '@robo-rally/game-events'
import type { GameSocket } from '@/gameServer'
import { logError } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/membershipHandlers'

export function handleSubmitProgram(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: ProgramResultAcknowledgement,
): void {
  if (typeof acknowledge !== 'function') return

  let acknowledged = false
  let playerId: string | undefined
  try {
    const player = ownedMembership(ctx, socket)?.player
    if (!player) {
      acknowledged = true
      acknowledge({ outcome: 'INVALID_PROGRAM' })
      return
    }
    playerId = player.id

    const parsed = submitProgramSchema.safeParse(payload)
    if (!parsed.success) {
      logError('Rejected malformed program submission', parsed.error, { command: 'program.submit', gameId: ctx.gameId, playerId: player.id, payload })
      acknowledged = true
      acknowledge({ outcome: 'INVALID_PROGRAM' })
      return
    }
    const submission = parsed.data
    if (submission.gameId !== ctx.gameId || submission.playerId !== player.id) {
      acknowledged = true
      acknowledge({ outcome: 'INVALID_PROGRAM' })
      return
    }

    const result = ctx.game.submitProgram(player.id, submission.cardIds)

    if (result.isErr()) {
      const outcome = result.error === 'GAME_PAUSED' || result.error === 'ALREADY_SUBMITTED' || result.error === 'WRONG_PHASE'
        ? result.error
        : 'INVALID_PROGRAM'
      acknowledged = true
      acknowledge({ outcome })
      return
    }

    acknowledged = true
    acknowledge({ outcome: 'ACCEPTED' })
    socket.to(ctx.publicRoom).emit('program.submitted', {
      gameId: ctx.gameId,
      playerId: player.id,
    })

    ctx.actionScheduler.scheduleNextAction()
  } catch (error) {
    logError('Failed to process program submission', error, { command: 'program.submit', gameId: ctx.gameId, playerId, payload })
    if (!acknowledged) acknowledge({ outcome: 'INVALID_PROGRAM' })
  }
}
