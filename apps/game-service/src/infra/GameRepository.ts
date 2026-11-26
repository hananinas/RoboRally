import type { DatabaseSync } from 'node:sqlite'
import type { BoardMapName, GameId, GameSnapshot, PlayerId } from '@/domain/game/index'

export const SCHEMA_VERSION = 1

export type PlayerIdentity = Readonly<{
  playerId: PlayerId
  userId: string
  username: string
}>

type StoredGame = Readonly<{
  snapshot: GameSnapshot
  identities: readonly PlayerIdentity[]
}>

export type GameRepository = Readonly<{
  createGame: (
    gameId: GameId,
    name: string,
    mapName: BoardMapName,
    snapshot: GameSnapshot,
    identities: readonly PlayerIdentity[],
  ) => void
  saveRound: (gameId: GameId, snapshot: GameSnapshot, identities: readonly PlayerIdentity[]) => void
  saveFinished: (
    gameId: GameId,
    snapshot: GameSnapshot,
    identities: readonly PlayerIdentity[],
    winnerPlayerId: PlayerId,
  ) => void
  saveAborted: (gameId: GameId) => void
  markPlayerLeft: (gameId: GameId, playerId: PlayerId) => void
}>

function serializeState(snapshot: GameSnapshot, identities: readonly PlayerIdentity[]): string {
  const stored: StoredGame = { snapshot, identities }
  return JSON.stringify(stored)
}

export function createGameRepository(database: DatabaseSync): GameRepository {
  const insertGame = database.prepare(`
    INSERT INTO games (id, name, map_name, status, created_at, updated_at, round_count, schema_version, state)
    VALUES ($gameId, $name, $mapName, 'in_progress', $now, $now, $roundCount, $schemaVersion, $state)
  `)
  const insertPlayer = database.prepare(`
    INSERT INTO game_players (game_id, player_id, user_id) VALUES ($gameId, $playerId, $userId)
  `)
  const updateState = database.prepare(`
    UPDATE games SET state = $state, updated_at = $now, round_count = $roundCount WHERE id = $gameId
  `)
  const finishGame = database.prepare(`
    UPDATE games
    SET state = $state, status = 'finished', winner_player_id = $winnerPlayerId,
        finished_at = $now, updated_at = $now, round_count = $roundCount
    WHERE id = $gameId
  `)
  const abortGame = database.prepare(`
    UPDATE games SET status = 'aborted', finished_at = $now, updated_at = $now WHERE id = $gameId
  `)
  const leaveGame = database.prepare(`
    UPDATE game_players SET left_at = $now WHERE game_id = $gameId AND player_id = $playerId
  `)

  function inTransaction(write: () => void): void {
    database.exec('BEGIN')
    try {
      write()
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  return {
    createGame(gameId, name, mapName, snapshot, identities) {
      inTransaction(() => {
        insertGame.run({
          gameId,
          name,
          mapName,
          now: Date.now(),
          roundCount: snapshot.completedRounds,
          schemaVersion: SCHEMA_VERSION,
          state: serializeState(snapshot, identities),
        })
        for (const { playerId, userId } of identities) {
          insertPlayer.run({ gameId, playerId, userId })
        }
      })
    },

    saveRound(gameId, snapshot, identities) {
      updateState.run({
        gameId,
        now: Date.now(),
        roundCount: snapshot.completedRounds,
        state: serializeState(snapshot, identities),
      })
    },

    saveFinished(gameId, snapshot, identities, winnerPlayerId) {
      finishGame.run({
        gameId,
        winnerPlayerId,
        now: Date.now(),
        roundCount: snapshot.completedRounds,
        state: serializeState(snapshot, identities),
      })
    },

    saveAborted(gameId) {
      abortGame.run({ gameId, now: Date.now() })
    },

    markPlayerLeft(gameId, playerId) {
      leaveGame.run({ gameId, playerId, now: Date.now() })
    },
  }
}
