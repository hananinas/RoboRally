import type { Game } from '@/domain/game/index'
import { presentCardsDealt, presentEnvironmentStepResolved, presentRobotActionResolved } from '@/socket/presenters/gamePresenter'
import type { GameSocketServer } from '@/socket/gameServer'
import { logError } from '@/logger'
import type { Winner } from '@robo-rally/game-events'

export type ActionSchedulerDeps = {
  io: GameSocketServer
  game: Game
  publicRoom: string
  playerRoom: (playerId: string) => string
  winner: () => Winner | null
  onProgrammingStarted: () => void
  onStop: () => void
}

export type ActionScheduler = {
  scheduleNextAction: () => void
  announceProgress: (result: { roundConcluded: boolean }) => void
  stop: () => void
}

export function createActionScheduler(
  { io, game, publicRoom, playerRoom, winner, onProgrammingStarted, onStop }: ActionSchedulerDeps,
): ActionScheduler {
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false
  let winnerAnnounced = false

  function announceWinner(): void {
    if (winnerAnnounced) return
    winnerAnnounced = true
    io.to(publicRoom).emit('game.won', { gameId: game.id, ...winner()! })
  }

  function announceHands(): void {
    for (const player of game.players) {
      io.to(playerRoom(player.id)).emit('cards.dealt', presentCardsDealt(game.id, player))
    }
    onProgrammingStarted()
  }

  function announceProgress(result: { roundConcluded: boolean }): void {
    if (game.winner !== undefined) announceWinner()
    if (result.roundConcluded) announceHands()
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
