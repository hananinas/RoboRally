import {
  parseSubmitProgram,
  type ProgramCardIds,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import type { Card, Player } from '@/game/index'
import type { GameSocket } from '@/gameServer'
import { logError } from '@/logger'
import { ownedMembership, type MembershipContext } from '@/membershipHandlers'

function findProgramCards(
  player: Player,
  cardIds: ProgramCardIds,
): Result<readonly Card[], 'UNKNOWN_CARD'> {
  const hand = player.hand
  const program = cardIds.map((id) => hand.find((card) => card.id === id))
  return program.every((card) => card !== undefined) ? ok(program) : err('UNKNOWN_CARD')
}

export function handleSubmitProgram(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: ProgramResultAcknowledgement,
): void {
  if (typeof acknowledge !== 'function') return
  const player = ownedMembership(ctx, socket)?.player
  if (!player) {
    acknowledge({ outcome: 'INVALID_PROGRAM' })
    return
  }

  let submission: SubmitProgram
  try {
    submission = parseSubmitProgram(payload)
  } catch (error) {
    logError('Rejected malformed program submission', error, { gameId: ctx.gameId, playerId: player.id })
    acknowledge({ outcome: 'INVALID_PROGRAM' })
    return
  }
  if (submission.gameId !== ctx.gameId || submission.playerId !== player.id) {
    acknowledge({ outcome: 'INVALID_PROGRAM' })
    return
  }

  const result = findProgramCards(player, submission.cardIds)
    .andThen((programCards) => ctx.game.submitProgram(player.id, programCards))

  if (result.isErr()) {
    acknowledge({ outcome: result.error === 'GAME_PAUSED' ? 'GAME_PAUSED' : 'INVALID_PROGRAM' })
    return
  }

  acknowledge({ outcome: 'ACCEPTED' })
  socket.to(ctx.publicRoom).emit('program.submitted', {
    gameId: ctx.gameId,
    playerId: player.id,
  })

  ctx.actionScheduler.scheduleNextAction()
}
