import {
  parseSubmitProgram,
  type ProgramCardIds,
  type ProgramResultAcknowledgement,
  type SubmitProgram,
} from '@robo-rally/game-events'
import type { Card, Player } from '@/game/index'
import type { GameSocket } from '@/gameServer'
import { ownedMembership, type MembershipContext } from '@/membershipHandlers'

function resolveProgram(
  player: Player,
  cardIds: ProgramCardIds,
): readonly Card[] | undefined {
  const hand = player.hand
  const program = cardIds.map((id) => hand.find((card) => card.id === id))
  return program.every((card) => card !== undefined) ? program : undefined
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
  if (ctx.game.paused) {
    acknowledge({ outcome: 'GAME_PAUSED' })
    return
  }

  try {
    const submission = parseSubmitProgram(payload)
    const program = resolveProgram(player, submission.cardIds)
    if (submission.gameId !== ctx.gameId || submission.playerId !== player.id || !program) {
      throw new Error('Program does not belong to this game')
    }
    ctx.game.submitProgram(player.id, program)
  } catch {
    acknowledge({ outcome: 'INVALID_PROGRAM' })
    return
  }

  acknowledge({ outcome: 'ACCEPTED' })
  socket.to(ctx.publicRoom).emit('program.submitted', {
    gameId: ctx.gameId,
    playerId: player.id,
  })

  ctx.actionScheduler.scheduleNextAction()
}
