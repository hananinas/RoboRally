import type { Game } from '@/game/index'
import { presentCardsDealt, presentRobotActionResolved } from '@/socket/gamePresenter'
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
}

export type ActionScheduler = {
  scheduleNextAction: () => void
  announceProgress: (result: { roundConcluded: boolean }) => void
  winner: () => Winner | null
  stop: () => void
}

export function createActionScheduler(
  { io, game, gameId, publicRoom, playerRoom, usernameOf  }: ActionSchedulerDeps,
): ActionScheduler {
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false
  let checkpointProgress = new Map(game.players.map((player) => [player.id, player.lastCheckpoint]))
  let winnerAnnounced = false
  let recordedWinner: Winner | null = null

  function broadcastCheckpointProgress(): void {
    const nextProgress = new Map<string, number>()
    for (const player of game.players) {
      nextProgress.set(player.id, player.lastCheckpoint)
      if (player.lastCheckpoint === (checkpointProgress.get(player.id) ?? 0)) continue
      io.to(publicRoom).emit('player.checkpointProgress', {
        gameId,
        playerId: player.id,
        lastCheckpoint: player.lastCheckpoint,
        checkpointCount: game.board.checkpointCount,
      })
    }
    checkpointProgress = nextProgress
  }

    // Record the winner's name while they are still a member; they may leave later.
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
  }

  function announceProgress(result: { roundConcluded: boolean }): void {
    broadcastCheckpointProgress()
    if (game.winner !== undefined) announceWinner()
    if (result.roundConcluded) announceHands()
  }

  function scheduleNextAction(): void {
    if (closed || scheduledAction || game.requirePhase('activation').isErr()) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed || game.requirePhase('activation').isErr()) return
      try {
        const result = game.executeNextAction()
        io.to(publicRoom).emit(
          'robot.actionResolved',
          presentRobotActionResolved(gameId, game, result),
        )
        announceProgress(result)
        scheduleNextAction()
      } catch (error) {
        logError('Failed to execute next robot action', error, {
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
  }

  return { scheduleNextAction, announceProgress, winner, stop }
}
