import type { ActivationProgress, Game, PlayerId } from '@/domain/game/index'
import { presentCardsDealt, presentEnvironmentStepResolved, presentRobotActionResolved } from '@/socket/presenters/gamePresenter'
import type { GameSocketServer } from '@/socket/gameServer'
import { logError } from '@/logger'

export type ActionSchedulerDeps = {
  io: GameSocketServer
  game: Game
  publicRoom: string
  playerRoom: (playerId: string) => string
  onWinnerDeclared: (playerId: PlayerId) => void
  onRoundConcluded: () => void
  onAborted: () => void
  onProgrammingStarted: () => void
  onStop: () => void
}

export type ActionScheduler = {
  scheduleNextAction: () => void
  announceProgress: (progress: ActivationProgress) => void
  stop: () => void
}

export function createActionScheduler(
  {
    io, game, publicRoom, playerRoom, onWinnerDeclared, onRoundConcluded, onAborted,
    onProgrammingStarted, onStop,
  }: ActionSchedulerDeps,
): ActionScheduler {
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false

  function announceHands(): void {
    for (const player of game.players) {
      io.to(playerRoom(player.id)).emit('cards.dealt', presentCardsDealt(game.id, player))
    }
    onProgrammingStarted()
  }

  function announceProgress(progress: ActivationProgress): void {
    if (progress.declaredWinner !== null) onWinnerDeclared(progress.declaredWinner)
    if (progress.roundConcluded) {
      announceHands()
      onRoundConcluded()
    }
  }

  function scheduleNextAction(): void {
    if (closed || scheduledAction || game.requirePhase('activation').isErr()) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed || game.requirePhase('activation').isErr()) return
      try {
        const step = game.executeNextStep()
        if (step.type === 'robot') {
          io.to(publicRoom).emit('robot.actionResolved', presentRobotActionResolved(game, step.result))
        } else {
          const result = presentEnvironmentStepResolved(game.id, step.result)
          const changed = result.kind === 'GEARS' ? result.robots.length > 0 : result.checkpointProgress.length > 0
          if (changed) io.to(publicRoom).emit('environment.stepResolved', result)
        }
        announceProgress(step.result)
        scheduleNextAction()
      } catch (error) {
        logError('Failed to execute next activation step', error, {
          source: 'actionScheduler',
          gameId: game.id,
          phase: game.lastActivePhase,
          registerIndex: game.currentRegister,
        })
        stop()
        game.abort()
        io.to(publicRoom).emit('game.aborted', { gameId: game.id })
        onAborted()
      }
    })
  }

  function stop(): void {
    closed = true
    clearImmediate(scheduledAction)
    onStop()
  }

  return { scheduleNextAction, announceProgress, stop }
}
