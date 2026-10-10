import type { Game } from '@/game/index'
import { presentCardsDealt, presentRobotActionResolved } from '@/gamePresenter'
import type { GameSocketServer } from '@/gameServer'
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
  dealHands: () => void
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
    if (closed || game.phase !== 'activation' || scheduledAction || game.paused) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed || game.phase !== 'activation') return
      try {
        const result = game.executeNextAction()
        io.to(publicRoom).emit(
          'robot.actionResolved',
          presentRobotActionResolved(gameId, result),
        )
        if (game.phase === 'activation') {
          scheduleNextAction()
        } else {
          dealHands()
        }
      } catch (error) {
        logError('Failed to execute next robot action', error, { gameId })
        stop()
        io.to(publicRoom).emit('game.aborted', { gameId })
      }
    })
  }

  function stop(): void {
    closed = true
    clearImmediate(scheduledAction)
  }

  return { scheduleNextAction, dealHands, stop }
}
