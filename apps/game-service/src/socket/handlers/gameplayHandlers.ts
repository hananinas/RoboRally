import {
  submitProgramSchema,
  updateRegistersSchema,
  type ProgramResult,
  type SubmitProgram,
  type UpdateRegisters,
  type UpdateRegistersResult,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { logWarn } from '@/logger'
import type { GameSession } from '@/socket/gameSession/GameSession'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { presentRegistersChanged } from '@/socket/presenters/gamePresenter'

function expireProgrammingIfDue(gameSession: GameSession): Result<void, 'WRONG_PHASE'> {
  if (gameSession.game.aborted || gameSession.game.winner !== undefined || gameSession.game.paused) return ok(undefined)

  const expired = gameSession.programmingTimer.expireIfDue()
  // Let the game operation report GAME_ABORTED if automatic completion failed.
  if (gameSession.game.aborted) return ok(undefined)

  return expired ? err('WRONG_PHASE') : ok(undefined)
}

export function handleCurrentGameProgram(
  context: SocketContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: (result: ProgramResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'program.submit', schema: submitProgramSchema, payload, acknowledge,
    resolve: (user) => {
      const gameSession = context.registry.getCurrentGame(user.userId)
      if (!gameSession) return err({ outcome: 'NOT_A_MEMBER' as const })
      return gameSession.isMember(socket)
        .map((seat) => ({ gameSession, player: seat.player }))
        .mapErr(() => ({ outcome: 'NOT_A_MEMBER' as const }))
    },
    run: ({ gameSession, player }, ack) => {
      const result = expireProgrammingIfDue(gameSession).andThen(() => gameSession.game.submitProgram(player.id, payload.cardIds))
      if (result.isErr()) {
        logWarn('Rejected program.submit request', { command: 'program.submit', gameId: gameSession.game.id, playerId: player.id, outcome: result.error, payload })
        ack({ outcome: result.error })
        return
      }
      ack({ outcome: 'ACCEPTED' })
      publishProgramFinalized(gameSession, { playerId: player.id, cards: player.robot.program }, 'SUBMITTED')
      gameSession.programmingTimer.start()
      if (gameSession.game.requirePhase('activation').isOk()) gameSession.programmingTimer.close()
    },
  })
}

export function handleCurrentGameRegisters(
  context: SocketContext,
  socket: GameSocket,
  payload: UpdateRegisters,
  acknowledge: (result: UpdateRegistersResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'game.updateRegisters', schema: updateRegistersSchema, payload, acknowledge,
    resolve: (user) => {
      const gameSession = context.registry.getCurrentGame(user.userId)
      if (!gameSession) return err({ outcome: 'NOT_A_MEMBER' as const })
      return gameSession.isMember(socket)
        .map((seat) => ({ gameSession, player: seat.player }))
        .mapErr(() => ({ outcome: 'NOT_A_MEMBER' as const }))
    },
    run: ({ gameSession, player }, ack) => {
      const result = expireProgrammingIfDue(gameSession).andThen(() => gameSession.game.updateRegisters(player.id, payload.cardIds))
      if (result.isErr()) {
        ack({ outcome: result.error })
        return
      }
      ack({ outcome: 'ACCEPTED' })
      gameSession.io.to(gameSession.publicRoom).emit('game.registersChanged', presentRegistersChanged(gameSession.game.id, player))
    },
  })
}
