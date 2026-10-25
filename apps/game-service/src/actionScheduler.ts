import type { Game } from '@/game/index'
import { presentCardsDealt, presentRobotActionResolved } from '@/socket/gamePresenter'
import type { GameSocketServer } from '@/socket/gameServer'
import { logError } from '@/logger'

export type ActionSchedulerDeps = {
  io: GameSocketServer
  game: Game
  gameId: string
  publicRoom: string
  playerRoom: (playerId: string) => string
  broadcastPublicState: () => void
}

export type ActionScheduler = {
  scheduleNextAction: () => void
  broadcastCheckpointProgress: () => void
  dealHands: () => void
  stop: () => void
}

export function createActionScheduler(
  { io, game, gameId, publicRoom, playerRoom, broadcastPublicState }: ActionSchedulerDeps,
): ActionScheduler {
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false
  let checkpointProgress = new Map(game.players.map((player) => [player.id, player.lastCheckpoint]))

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

  function dealHands(): void {
    // programmingStarted announces the reset, so the slots clear first and the
    // cleared state follows the announcement.
    game.beginProgramming()
    for (const player of game.players) {
      io.to(playerRoom(player.id)).emit('cards.dealt', presentCardsDealt(gameId, player))
    }
    io.to(publicRoom).emit('game.programmingStarted', { gameId })
    broadcastPublicState()
  }

  function scheduleNextAction(): void {
    if (closed || game.phase !== 'activation' || scheduledAction || game.paused || game.awaitingProgrammingStart) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed || game.phase !== 'activation' || game.paused || game.aborted) return
      try {
        const result = game.executeNextAction()
        io.to(publicRoom).emit(
          'robot.actionResolved',
          presentRobotActionResolved(gameId, result),
        )
        broadcastPublicState()
        broadcastCheckpointProgress()
        if (result.roundComplete) {
          dealHands()
        } else {
          scheduleNextAction()
        }
      } catch (error) {
        logError('Failed to execute next robot action', error, {
          source: 'actionScheduler',
          gameId,
          phase: game.phase,
          registerIndex: game.currentRegister,
        })
        stop()
        game.abort()
        broadcastPublicState()
        io.to(publicRoom).emit('game.aborted', { gameId })
      }
    })
  }

  function stop(): void {
    closed = true
    clearImmediate(scheduledAction)
  }

  return { scheduleNextAction, broadcastCheckpointProgress, dealHands, stop }
}
