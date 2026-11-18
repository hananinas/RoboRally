import type { ProgramFinalized } from '@robo-rally/game-events'
import type { CompletedProgram } from '@/domain/game/index'
import { presentProgramFinalized } from '@/gamePresenter'
import type { MembershipContext } from '@/socket/gameSession/gameMembership'

export function publishProgramFinalized(
  { io, game, publicRoom, playerRoom }: Pick<MembershipContext, 'io' | 'game' | 'publicRoom' | 'playerRoom'>,
  program: CompletedProgram,
  reason: ProgramFinalized['reason'],
): void {
  io.to(playerRoom(program.playerId)).emit('program.finalized', presentProgramFinalized(game.id, program, reason))
  io.to(publicRoom).emit('game.registersChanged', {
    gameId: game.id,
    playerId: program.playerId,
    registers: [
      { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' },
    ],
  })
  io.to(publicRoom).emit('program.submitted', { gameId: game.id, playerId: program.playerId })
}
