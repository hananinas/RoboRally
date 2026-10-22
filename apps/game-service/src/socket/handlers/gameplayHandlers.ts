import {
  submitProgramSchema,
  updateRegistersSchema,
  type UpdateRegisters,
  type UpdateRegistersResult,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import type { ZodError } from 'zod'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
import type { Player } from '@/game/index'
import type { GameSocket } from '@/socket/gameServer'
import { logError, logWarn } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/socket/handlers/membershipHandlers'
import { toRejection, type Rejection } from '@/socket/utilities/rejection'

type ValidateGameplayRequestError =
  | 'NOT_A_MEMBER'
  | 'GAME_ID_MISMATCH'
  | 'PLAYER_ID_MISMATCH'
  | Rejection<'INVALID_REQUEST', ZodError>

function validateGameplayRequest(
  ctx: MembershipContext,
  socket: GameSocket,
  schema: typeof submitProgramSchema,
  payload: unknown,
): Result<{ player: Player; data: SubmitProgram }, ValidateGameplayRequestError> {
  const player = ownedMembership(ctx, socket)?.player
  if (!player) return err('NOT_A_MEMBER')

  const parsed = schema.safeParse(payload)
  if (!parsed.success) return err({ outcome: 'INVALID_REQUEST', detail: parsed.error })
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
  let playerId: string | undefined

  withAcknowledgeOnce(acknowledge, (ack) => {
    const result = validateGameplayRequest(ctx, socket, submitProgramSchema, payload)
      .andThen(({ player, data }) => {
        playerId = player.id
        return ctx.game.submitProgram(player.id, data.cardIds).map(() => player)
      })
      .mapErr(toRejection)

    if (result.isErr()) {
      const { outcome, detail } = result.error
      logWarn('Rejected program.submit request', { command: 'program.submit', gameId: ctx.gameId, playerId, outcome, detail, payload })
      ack({ outcome })
      return
    }

    ack({ outcome: 'ACCEPTED' })

    socket.to(ctx.publicRoom).emit('program.submitted', {
      gameId: ctx.gameId,
      playerId: result.value.id,
    })

    ctx.actionScheduler.scheduleNextAction()
  }, (error) => {
    logError('Failed to process program submission', error, { command: 'program.submit', gameId: ctx.gameId, playerId, payload })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}

export function handleUpdateRegisters(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: UpdateRegisters,
  acknowledge: (result: UpdateRegistersResult) => void,
): void {
  withAcknowledgeOnce(acknowledge, (ack) => {
    const parsed = updateRegistersSchema.safeParse(payload)
    if (!parsed.success) {
      ack({ outcome: 'INVALID_REQUEST' })
      return
    }
    const membership = ownedMembership(ctx, socket)
    if (!membership || parsed.data.gameId !== ctx.gameId) {
      ack({ outcome: 'NOT_A_MEMBER' })
      return
    }
    const { player } = membership
    if (parsed.data.playerId !== player.id) {
      ack({ outcome: 'PLAYER_ID_MISMATCH' })
      return
    }
    const result = ctx.game.updateRegisters(player.id, parsed.data.occupied)
    ack(result)
    if (result.outcome === 'ACCEPTED') {
      ctx.io.to(ctx.publicRoom).emit('game.registersChanged', {
        gameId: ctx.gameId, playerId: player.id, registers: player.registers,
      })
    }
  }, (error) => {
    logError('Failed to update registers', error, { command: 'game.updateRegisters', gameId: ctx.gameId })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}
