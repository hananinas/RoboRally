import type { Game } from '@/game/index'
import { presentCardsDealt, presentEnvironmentStepResolved, presentRobotActionResolved } from '@/socket/gamePresenter'
import type { GameSocketServer } from '@/socket/gameServer'
import { logError } from '@/logger'

export type ActionSchedulerDeps = {
  io: GameSocketServer
  game: Game
  gameId: string
  publicRoom: string
  playerRoom: (playerId: string) => string
}

export type ActionScheduler = {
  scheduleNextAction: () => void
  stop: () => void
}

export function createActionScheduler(
  { io, game, gameId, publicRoom, playerRoom }: ActionSchedulerDeps,
): ActionScheduler {
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false

  function dealHands(): void {
    for (const player of game.players) {
      io.to(playerRoom(player.id)).emit('cards.dealt', presentCardsDealt(gameId, player))
    }
  }

  function scheduleNextAction(): void {
    if (closed || game.phase !== 'activation' || scheduledAction || game.paused || game.aborted) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed || game.phase !== 'activation' || game.paused || game.aborted) return
      try {
        const step = game.executeNextStep()
        if (step.type === 'robot') {
          io.to(publicRoom).emit('robot.actionResolved', presentRobotActionResolved(gameId, step.result))
        } else {
          io.to(publicRoom).emit('environment.stepResolved', presentEnvironmentStepResolved(gameId, step.result))
        }
        if (game.phase === 'activation') {
          scheduleNextAction()
        } else {
          dealHands()
        }
      } catch (error) {
        logError('Failed to execute next activation step', error, {
          source: 'actionScheduler',
          gameId,
          phase: game.phase,
          registerIndex: game.currentRegister,
        })
        stop()
        game.abort()
        io.to(publicRoom).emit('game.aborted', { gameId })
      }
    })
  }

  function stop(): void {
    closed = true
    clearImmediate(scheduledAction)
  }

  return { scheduleNextAction, stop }
}
