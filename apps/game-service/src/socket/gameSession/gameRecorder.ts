import type { BoardMapName, Game, PlayerId } from '@/domain/game/index'
import type { GameRepository, PlayerIdentity } from '@/infra/GameRepository'
import type { Seat } from '@/socket/gameSession/GameSession'
import { logError } from '@/logger'

export type GameRecorder = Readonly<{
  saveState: () => void
  saveFinished: (winnerPlayerId: PlayerId) => void
  saveAborted: () => void
  markPlayerLeft: (playerId: PlayerId) => void
}>

export type GameRecorderDeps = Readonly<{
  repository: GameRepository
  game: Game
  mapName: BoardMapName
  seats: () => Iterable<Seat>
}>

export function createGameRecorder({ repository, game, mapName, seats }: GameRecorderDeps): GameRecorder {
  function identities(): PlayerIdentity[] {
    return [...seats()].map(({ user, player }) => ({
      playerId: player.id,
      userId: user.userId,
      username: user.username,
    }))
  }

  function write(operation: string, save: () => void): void {
    try {
      save()
    } catch (error) {
      logError('Failed to record game state', error, { gameId: game.id, source: 'gameRecorder', operation })
    }
  }

  return {
    saveState() {
      // The last player leaving concludes a round with nobody left. Storing that
      // would overwrite the last state in which players stood somewhere, and no
      // reader benefits from an empty board the status column already implies.
      if (game.players.length === 0) return
      write('saveState', () => {
        repository.saveRound(game.id, game.name, mapName, game.snapshot, identities())
      })
    },

    saveFinished(winnerPlayerId) {
      write('saveFinished', () => {
        repository.saveFinished(game.id, game.name, mapName, game.snapshot, identities(), winnerPlayerId)
      })
    },

    saveAborted() {
      // A declared win is the game's outcome, and the winner leaving afterwards
      // is how a finished game normally empties. Recording an abort here would
      // replace the stored winner with nothing.
      if (game.winner !== undefined) return
      write('saveAborted', () => repository.saveAborted(game.id))
    },

    markPlayerLeft(playerId) {
      write('markPlayerLeft', () => repository.markPlayerLeft(game.id, playerId))
    },
  }
}
