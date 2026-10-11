import {
  submitProgramSchema,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import type { Player } from '@/game/index'
import type { GameSocket } from '@/gameServer'
import { logError } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/membershipHandlers'

type ValidateGameplayRequestError = 'NOT_A_MEMBER' | 'MALFORMED_REQUEST' | 'GAME_ID_MISMATCH' | 'PLAYER_ID_MISMATCH'

function validateGameplayRequest<T extends { gameId: string; playerId: string }>(
  ctx: MembershipContext,
  socket: GameSocket,
  schema: { safeParse(payload: unknown): { success: true; data: T } | { success: false; error: unknown } },
  payload: unknown,
  command: string,
): Result<{ player: Player; data: T }, ValidateGameplayRequestError> {
  const player = ownedMembership(ctx, socket)?.player
  if (!player) return err('NOT_A_MEMBER')

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    logError(`Rejected malformed ${command} request`, parsed.error, { command, gameId: ctx.gameId, playerId: player.id, payload })
    return err('MALFORMED_REQUEST')
  }
  if (parsed.data.gameId !== ctx.gameId) return err('GAME_ID_MISMATCH')
  if (parsed.data.playerId !== player.id) return err('PLAYER_ID_MISMATCH')

  return ok({ player, data: parsed.data })
}

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
    const result = validateGameplayRequest(ctx, socket, submitProgramSchema, payload, 'program.submit')
      .andThen(({ player, data }) => {
        playerId = player.id
        return ctx.game.submitProgram(player.id, data.cardIds).map(() => player)
      })
    
    if (result.isErr()) {
      acknowledge({ outcome: result.error })
      return
    }
    
    acknowledged = true
    acknowledge({ outcome: 'ACCEPTED' })

    socket.to(ctx.publicRoom).emit('program.submitted', {
      gameId: ctx.gameId,
      playerId: result.value.id,
    })

    ctx.actionScheduler.scheduleNextAction()
  } catch (error) {
    logError('Failed to process program submission', error, { command: 'program.submit', gameId: ctx.gameId, playerId, payload })
    if (!acknowledged) acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
}
