import type { Game } from '@/game/index'
import { presentCardsDealt, presentEnvironmentStepResolved, presentRobotActionResolved } from '@/socket/gamePresenter'
import type { GameSocketServer } from '@/socket/gameServer'
import { logError } from '@/logger'
import type { Winner } from '@robo-rally/game-events'

export type ActionSchedulerDeps = {
  io: GameSocketServer
  game: Game
  gameId: string
  publicRoom: string
  playerRoom: (playerId: string) => string
  usernameOf: (playerId: string) => string | undefined
  onProgrammingStarted: () => void
  onStop: () => void
}

export type ActionScheduler = {
  scheduleNextAction: () => void
  announceProgress: (result: { roundConcluded: boolean }) => void
  winner: () => Winner | null
  stop: () => void
}

export function createActionScheduler(
  { io, game, gameId, publicRoom, playerRoom, usernameOf, onProgrammingStarted, onStop }: ActionSchedulerDeps,
): ActionScheduler {
  let announcedChoiceId: string | null = null
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false
  let winnerAnnounced = false
  let recordedWinner: Winner | null = null

  // Record the winner before they can leave.
  function winner(): Winner | null {
    if (recordedWinner === null && game.winner !== undefined) {
      recordedWinner = { playerId: game.winner, username: usernameOf(game.winner) ?? '' }
    }
    return recordedWinner
  }

  function announceWinner(): void {
    if (winnerAnnounced) return
    winnerAnnounced = true
    io.to(publicRoom).emit('game.won', { gameId, ...winner()! })
  }

  function announceHands(): void {
    for (const player of game.players) {
      io.to(playerRoom(player.id)).emit('cards.dealt', presentCardsDealt(gameId, player))
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
        const choice = game.prepareNextChoice()
        if ((choice?.choiceId ?? null) !== announcedChoiceId){
          io.to(publicRoom).emit('card.choiceChanged', {
            gameId,
            choice,
          })
          announcedChoiceId = choice?.choiceId ?? null
        }
        if (choice) return

        const step = game.executeNextStep()
        if (step.type === 'robot') {
          io.to(publicRoom).emit('robot.actionResolved', presentRobotActionResolved(gameId, game, step.result))
        } else {
          const result = presentEnvironmentStepResolved(gameId, step.result)
          const changed = result.kind === 'GEARS' ? result.robots.length > 0 : result.checkpointProgress.length > 0
          if (changed) io.to(publicRoom).emit('environment.stepResolved', result)
        }
        announceProgress(step.result)
        scheduleNextAction()
      } catch (error) {
        logError('Failed to execute next activation step', error, {
          source: 'actionScheduler',
          gameId,
          phase: game.lastActivePhase,
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
    onStop()
  }

  return { scheduleNextAction, announceProgress, winner, stop }
}
