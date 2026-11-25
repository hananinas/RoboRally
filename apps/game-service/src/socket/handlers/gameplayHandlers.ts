import {
  submitProgramSchema,
  updateRegistersSchema,
  type ResolvedInstruction,
  type UpdateRegisters,
  type UpdateRegistersResult,
  type RegistersChanged,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
  effects,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import {z, type ZodError } from 'zod'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
import type { Player } from '@/game/index'
import type { GameSocket } from '@/socket/gameServer'
import { logError, logWarn } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/socket/handlers/membershipHandlers'
import { toRejection, type Rejection } from '@/socket/utilities/rejection'
import { publishProgramFinalized } from '@/socket/programFinalization'

const chooseCardActionSchema = z.object({
  choiceId: z.uuid(),
  instruction: z.custom<ResolvedInstruction>((value) =>
    typeof value === 'string' && Object.hasOwn(effects, value),
  ),
}).strict()


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
    ctx.io.to(ctx.publicRoom).emit('game.registersChanged', {
      gameId: ctx.game.id,
      playerId: player.id,
      // Successful updateRegisters synchronously replaces every slot with EMPTY/HIDDEN.
      // No activation can interleave before this read; snapshots retain their wider type.
      registers: player.registers as RegistersChanged['registers'],
    })
  }, (error) => {
    logError('Failed to update registers', error, { command: 'game.updateRegisters', gameId: ctx.game.id })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}

export function handleCardChoice(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: import('@robo-rally/game-events').ChooseCardAction,
  acknowledge: (
    result: import('@robo-rally/game-events').CardChoiceResult,
  ) => void,
): void {
  withAcknowledgeOnce(acknowledge, (ack) => {
    const membership = ownedMembership(ctx, socket)

    if (!membership) {
      return ack({ outcome: 'NOT_A_MEMBER' })
    }

    const parsed = chooseCardActionSchema.safeParse(payload)

    if (!parsed.success) {
      return ack({ outcome: 'INVALID_REQUEST' })
    }

    const result = ctx.game.chooseCardAction(
      membership.player.id,
      parsed.data,
    )

    if (result.isErr()) {
      return ack({ outcome: result.error })
    }

    ack({ outcome: 'ACCEPTED' })
    ctx.actionScheduler.scheduleNextAction()
  }, (error) => {
    logError('Failed to choose card action', error, {
      command: 'card.choose',
      gameId: ctx.gameId,
    })

    return { outcome: 'INTERNAL_ERROR' } as const
  })
}
