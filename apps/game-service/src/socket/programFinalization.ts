import type { ProgramFinalized } from '@robo-rally/game-events'
import type { CompletedProgram } from '@/game/index'
import { presentProgramFinalized } from '@/socket/gamePresenter'
import type { MembershipContext } from '@/socket/handlers/membershipHandlers'

export function publishProgramFinalized(
  { io, gameId, publicRoom, playerRoom }: Pick<MembershipContext, 'io' | 'gameId' | 'publicRoom' | 'playerRoom'>,
  program: CompletedProgram,
  reason: ProgramFinalized['reason'],
): void {
  io.to(playerRoom(program.playerId)).emit('program.finalized', presentProgramFinalized(gameId, program, reason))
  io.to(publicRoom).emit('game.registersChanged', {
    gameId,
    playerId: program.playerId,
    registers: [
      { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' },
    ],
  })
  io.to(publicRoom).emit('program.submitted', { gameId, playerId: program.playerId })
}
