import type { ProgramFinalized } from '@robo-rally/game-events'
import type { CompletedProgram } from '@/domain/game/index'
import { presentProgramFinalized, presentRegistersChanged } from '@/socket/presenters/gamePresenter'
import type { MembershipContext } from '@/socket/gameSession/gameMembership'

export function publishProgramFinalized(
  { io, game, publicRoom, playerRoom }: Pick<MembershipContext, 'io' | 'game' | 'publicRoom' | 'playerRoom'>,
  program: CompletedProgram,
  reason: ProgramFinalized['reason'],
): void {
  io.to(playerRoom(program.playerId)).emit('program.finalized', presentProgramFinalized(game.id, program, reason))
  const player = game.players.find((candidate) => candidate.id === program.playerId)
  if (!player) throw new Error(`Missing player ${program.playerId} for finalized program`)
  io.to(publicRoom).emit('game.registersChanged', presentRegistersChanged(game.id, player))
  io.to(publicRoom).emit('program.submitted', { gameId: game.id, playerId: program.playerId })
}
