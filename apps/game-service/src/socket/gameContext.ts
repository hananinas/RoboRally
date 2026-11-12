import type { GameSocketServer, GameSession } from '@/socket/gameServer'
import { presentProgrammingTimer, presentPublicGameState } from '@/socket/gamePresenter'
import { createActionScheduler } from '@/actionScheduler'
import { createProgrammingTimer } from '@/programmingTimer'
import { publishProgramFinalized } from '@/socket/programFinalization'
import { logError } from '@/logger'
import type { GameMembership, MembershipContext } from '@/socket/handlers/membershipHandlers'

export function createGameContext(io: GameSocketServer, session: GameSession): MembershipContext {
  const { gameId, game } = session
  const publicRoom = `game:${gameId}:public`
  const playerRoom = (playerId: string) => `game:${gameId}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()
  const usernameOf = (playerId: string) =>
    [...memberships.values()].find((membership) => membership.player.id === playerId)?.user.username

  const actionScheduler = createActionScheduler({
    io, game, gameId, publicRoom, playerRoom, usernameOf,
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
          publishProgramFinalized({ io, gameId, publicRoom, playerRoom }, program, 'TIMEOUT')
        }
      } catch (error) {
        logError('Failed to complete programs at the deadline', error, { gameId, source: 'programmingTimer' })
        actionScheduler.stop()
        game.abort()
        io.to(publicRoom).emit('game.aborted', { gameId })
      }
    },
    onChange: (timer) => {
      io.to(publicRoom).emit('program.timerChanged', presentProgrammingTimer(gameId, timer))
      if (timer.status !== 'CLOSED' || game.requirePhase('activation').isErr()) return
      actionScheduler.scheduleNextAction()
    },
  })

  const publicState = () => presentPublicGameState(gameId, game, programmingTimer.state(),
    [...memberships.values()].map(({ user, player, connectionId }) => ({
      playerId: player.id,
      lastCheckpoint: player.lastCheckpoint,
      username: user.username,
      programSubmitted: game.hasSubmittedProgram(player.id),
      connected: connectionId !== null,
      registers: player.registers,
    })),
    actionScheduler.winner(),
  )

  return {
    io, game, gameId, publicRoom, playerRoom, memberships, publicState, actionScheduler, programmingTimer,
  }

}
