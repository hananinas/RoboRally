import type { GameSocketServer } from '@/socket/gameServer'
import type { Game } from '@/domain/game/index'
import { presentProgrammingTimer, presentPublicGameState, presentWinner } from '@/socket/presenters/gamePresenter'
import { createActionScheduler } from '@/socket/gameSession/actionScheduler'
import { createProgrammingTimer } from '@/programmingTimer'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { logError } from '@/logger'
import type { GameMembership, MembershipContext } from '@/socket/gameSession/gameMembership'
import type { Winner } from '@robo-rally/game-events'

export function createGameContext(io: GameSocketServer, game: Game): MembershipContext {
  const publicRoom = `game:${game.id}:public`
  const playerRoom = (playerId: string) => `game:${game.id}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()

  // Record the winner's name while they are still a member; they may leave later.
  let recordedWinner: Winner | null = null
  const winner = (): Winner | null => {
    if (recordedWinner === null && game.winner !== undefined) {
      const membership = [...memberships.values()].find(({ player }) => player.id === game.winner)
      recordedWinner = presentWinner(game.winner, membership?.user.username ?? '')
    }
    return recordedWinner
  }

  const actionScheduler = createActionScheduler({
    io, game, publicRoom, playerRoom, winner,
    onProgrammingStarted: () => programmingTimer.reset(),
    onStop: () => programmingTimer.stop(),
  })
  const programmingTimer = createProgrammingTimer({
    onExpire: () => {
      if (game.aborted || game.winner !== undefined || memberships.size === 0) {
        programmingTimer.stop()
        return
      }
      try {
        const completed = game.completePrograms()
        if (completed.isErr()) throw new Error(`Cannot complete programs: ${completed.error}`)
        for (const program of completed.value) {
          publishProgramFinalized({ io, game, publicRoom, playerRoom }, program, 'TIMEOUT')
        }
      } catch (error) {
        logError('Failed to complete programs at the deadline', error, { gameId: game.id, source: 'programmingTimer' })
        actionScheduler.stop()
        game.abort()
        io.to(publicRoom).emit('game.aborted', { gameId: game.id })
      }
    },
    onChange: (timer) => {
      io.to(publicRoom).emit('program.timerChanged', presentProgrammingTimer(game.id, timer))
      if (timer.status !== 'CLOSED' || game.requirePhase('activation').isErr()) return
      actionScheduler.scheduleNextAction()
    },
  })

  const publicState = () => presentPublicGameState(game, programmingTimer.state(), memberships.values(), winner())

  return {
    io, game, publicRoom, playerRoom, memberships, publicState, actionScheduler, programmingTimer,
  }
}
