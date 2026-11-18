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
import type { Player } from '@/domain/game/index'
import type { GameSocket } from '@/socket/gameServer'
import { logError, logWarn } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/socket/gameSession/gameMembership'
import { toRejection, type Rejection } from '@/socket/utilities/rejection'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { presentRegistersChanged } from '@/socket/presenters/gamePresenter'

type ValidateSubmissionRequestError =
  | 'NOT_A_MEMBER'
  | Rejection<'INVALID_REQUEST', ZodError>

function validateSubmissionRequest(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: unknown,
): Result<{ player: Player; data: SubmitProgram }, ValidateSubmissionRequestError> {
  const player = ownedMembership(ctx, socket)?.player
  if (!player) return err('NOT_A_MEMBER')

  const parsed = submitProgramSchema.safeParse(payload)
  if (!parsed.success) return err({ outcome: 'INVALID_REQUEST', detail: parsed.error })

  return ok({ player, data: parsed.data })
}

function expireProgrammingIfDue(ctx: MembershipContext): Result<void, 'WRONG_PHASE'> {
  if (ctx.game.aborted || ctx.game.winner !== undefined || ctx.game.paused) return ok(undefined)

  const expired = ctx.programmingTimer.expireIfDue()
  // Let the game operation report GAME_ABORTED if automatic completion failed.
  if (ctx.game.aborted) return ok(undefined)

  return expired ? err('WRONG_PHASE') : ok(undefined)
}

export function handleSubmitProgram(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: ProgramResultAcknowledgement,
): void {
  let playerId: string | undefined

  withAcknowledgeOnce(acknowledge, (ack) => {
    const result = validateSubmissionRequest(ctx, socket, payload)
      .andThen(({ player, data }) => {
        playerId = player.id
        return expireProgrammingIfDue(ctx)
          .andThen(() => ctx.game.submitProgram(player.id, data.cardIds)).map(() => player)
      })
      .mapErr(toRejection)

    if (result.isErr()) {
      const { outcome, detail } = result.error
      logWarn('Rejected program.submit request', { command: 'program.submit', gameId: ctx.game.id, playerId, outcome, detail, payload })
      ack({ outcome })
      return
    }

    ack({ outcome: 'ACCEPTED' })

    const player = result.value
    publishProgramFinalized(ctx, { playerId: player.id, cards: player.robot.program }, 'SUBMITTED')
    ctx.programmingTimer.start()
    if (ctx.game.requirePhase('activation').isOk()) ctx.programmingTimer.close()
  }, (error) => {
    logError('Failed to process program submission', error, { command: 'program.submit', gameId: ctx.game.id, playerId, payload })
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
    if (!membership) {
      ack({ outcome: 'NOT_A_MEMBER' })
      return
    }
    const { player } = membership
    const result = expireProgrammingIfDue(ctx)
      .andThen(() => ctx.game.updateRegisters(player.id, parsed.data.cardIds)).mapErr(toRejection)
    if (result.isErr()) {
      ack({ outcome: result.error.outcome })
      return
    }

    ack({ outcome: 'ACCEPTED' })
    ctx.io.to(ctx.publicRoom).emit('game.registersChanged', presentRegistersChanged(ctx.game.id, player))
  }, (error) => {
    logError('Failed to update registers', error, { command: 'game.updateRegisters', gameId: ctx.game.id })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}
