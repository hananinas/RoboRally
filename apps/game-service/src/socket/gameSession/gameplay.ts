import {
  submitProgramSchema,
  updateRegistersSchema,
  type UpdateRegisters,
  type UpdateRegistersResult,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import type { GameSocket } from '@/socket/gameServer'
import { logWarn } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/socket/gameSession/gameMembership'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { presentRegistersChanged } from '@/socket/presenters/gamePresenter'

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
  withValidatedRequest({
    socket, command: 'program.submit', schema: submitProgramSchema, payload, acknowledge,
    resolve: () => {
      const player = ownedMembership(ctx, socket)?.player
      return player ? ok(player) : err({ outcome: 'NOT_A_MEMBER' as const })
    },
    run: (player, ack) => {
      const result = expireProgrammingIfDue(ctx).andThen(() => ctx.game.submitProgram(player.id, payload.cardIds))
      if (result.isErr()) {
        logWarn('Rejected program.submit request', { command: 'program.submit', gameId: ctx.game.id, playerId: player.id, outcome: result.error, payload })
        ack({ outcome: result.error })
        return
      }
      ack({ outcome: 'ACCEPTED' })
      publishProgramFinalized(ctx, { playerId: player.id, cards: player.robot.program }, 'SUBMITTED')
      ctx.programmingTimer.start()
      if (ctx.game.requirePhase('activation').isOk()) ctx.programmingTimer.close()
    },
  })
}

export function handleUpdateRegisters(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: UpdateRegisters,
  acknowledge: (result: UpdateRegistersResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'game.updateRegisters', schema: updateRegistersSchema, payload, acknowledge,
    resolve: () => {
      const player = ownedMembership(ctx, socket)?.player
      return player ? ok(player) : err({ outcome: 'NOT_A_MEMBER' as const })
    },
    run: (player, ack) => {
      const result = expireProgrammingIfDue(ctx).andThen(() => ctx.game.updateRegisters(player.id, payload.cardIds))
      if (result.isErr()) {
        ack({ outcome: result.error })
        return
      }
      ack({ outcome: 'ACCEPTED' })
      ctx.io.to(ctx.publicRoom).emit('game.registersChanged', presentRegistersChanged(ctx.game.id, player))
    },
  })
}
