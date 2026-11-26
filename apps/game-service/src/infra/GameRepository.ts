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
  saveRound: (
    gameId: GameId,
    name: string,
    mapName: BoardMapName,
    snapshot: GameSnapshot,
    identities: readonly PlayerIdentity[],
  ) => void
  saveFinished: (
    gameId: GameId,
    name: string,
    mapName: BoardMapName,
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
  const saveStateQuery = database.prepare(`
    INSERT INTO games (id, name, map_name, status, created_at, updated_at, round_count, schema_version, state)
    VALUES ($gameId, $name, $mapName, 'in_progress', $now, $now, $roundCount, $schemaVersion, $state)
    ON CONFLICT (id) DO UPDATE SET
      updated_at = excluded.updated_at,
      round_count = excluded.round_count,
      schema_version = excluded.schema_version,
      state = excluded.state
  `)
  const saveOutcomeQuery = database.prepare(`
    UPDATE games
    SET status = $status, winner_player_id = $winnerPlayerId, finished_at = $now, updated_at = $now
    WHERE id = $gameId
  `)
  const saveSeatQuery = database.prepare(`
    INSERT INTO game_players (game_id, player_id, user_id) VALUES ($gameId, $playerId, $userId)
    ON CONFLICT (game_id, player_id) DO NOTHING
  `)
  const markPlayerLeftQuery = database.prepare(`
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

  function saveState(
    gameId: GameId,
    name: string,
    mapName: BoardMapName,
    snapshot: GameSnapshot,
    identities: readonly PlayerIdentity[],
  ): void {
    saveStateQuery.run({
      gameId,
      name,
      mapName,
      now: Date.now(),
      roundCount: snapshot.completedRounds,
      schemaVersion: SCHEMA_VERSION,
      state: serializeState(snapshot, identities),
    })
    for (const { playerId, userId } of identities) {
      saveSeatQuery.run({ gameId, playerId, userId })
    }
  }

  return {
    saveRound(gameId, name, mapName, snapshot, identities) {
      inTransaction(() => saveState(gameId, name, mapName, snapshot, identities))
    },

    saveFinished(gameId, name, mapName, snapshot, identities, winnerPlayerId) {
      inTransaction(() => {
        saveState(gameId, name, mapName, snapshot, identities)
        saveOutcomeQuery.run({ gameId, winnerPlayerId, status: 'finished', now: Date.now() })
      })
    },

    saveAborted(gameId) {
      saveOutcomeQuery.run({ gameId, winnerPlayerId: null, status: 'aborted', now: Date.now() })
    },

    markPlayerLeft(gameId, playerId) {
      markPlayerLeftQuery.run({ gameId, playerId, now: Date.now() })
    },
  }
}
