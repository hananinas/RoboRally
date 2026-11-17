import type { GameSocketServer } from '@/socket/gameServer'
import type { Game } from '@/game/index'
import { presentProgrammingTimer, presentPublicGameState } from '@/socket/gamePresenter'
import { createActionScheduler } from '@/actionScheduler'
import { createProgrammingTimer } from '@/programmingTimer'
import { publishProgramFinalized } from '@/socket/programFinalization'
import { logError } from '@/logger'
import type { GameMembership, MembershipContext } from '@/socket/gameMembership'

export function createGameContext(io: GameSocketServer, game: Game): MembershipContext {
  const publicRoom = `game:${game.id}:public`
  const playerRoom = (playerId: string) => `game:${game.id}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()
  const usernameOf = (playerId: string) =>
    [...memberships.values()].find((membership) => membership.player.id === playerId)?.user.username

  const actionScheduler = createActionScheduler({
    io, game, publicRoom, playerRoom, usernameOf,
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

  const publicState = () => presentPublicGameState(game, programmingTimer.state(),
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
    io, game, publicRoom, playerRoom, memberships, publicState, actionScheduler, programmingTimer,
  }
}
