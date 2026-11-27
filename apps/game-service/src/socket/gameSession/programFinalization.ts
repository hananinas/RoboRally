import type { ProgramFinalized } from '@robo-rally/game-events'
import type { CompletedProgram } from '@/domain/game/index'
import { presentProgramFinalized, presentRegistersChanged } from '@/socket/presenters/gamePresenter'
import type { GameSession } from '@/socket/gameSession/GameSession'

export function publishProgramFinalized(
  gameSession: GameSession,
  program: CompletedProgram,
  reason: ProgramFinalized['reason'],
): void {
  const { io, game, publicRoom } = gameSession
  io.to(gameSession.playerRoom(program.playerId)).emit('program.finalized', presentProgramFinalized(game.id, program, reason))
  const player = game.players.find((candidate) => candidate.id === program.playerId)
  if (!player) throw new Error(`Missing player ${program.playerId} for finalized program`)
  io.to(publicRoom).emit('game.registersChanged', presentRegistersChanged(game, player))
  io.to(publicRoom).emit('program.submitted', { gameId: game.id, playerId: program.playerId })
}
