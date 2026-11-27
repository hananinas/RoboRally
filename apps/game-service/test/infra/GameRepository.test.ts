import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GameSnapshot, PlayerSnapshot } from '@/domain/game/index'
import { DATABASE_FILE_NAME, openDatabase } from '@/infra/database'
import { createGameRepository, SCHEMA_VERSION, type GameRepository, type PlayerIdentity } from '@/infra/GameRepository'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url))

function identityFor(playerId: string): PlayerIdentity {
  return { playerId, userId: `user-${playerId}`, username: `name-${playerId}` }
}

function playerSnapshot(playerId: string): PlayerSnapshot {
  return {
    playerId,
    robotId: `robot-${playerId}`,
    robotColour: '#c74f4f',
    robotSpriteId: 'tank',
    position: { x: 1, y: 2 },
    orientation: 'NORTH',
    lastCheckpoint: 0,
    hand: [{ id: `card-${playerId}`, instruction: 'MOVE_1' }],
    deck: { drawPile: [], discardPile: [] },
  }
}

function snapshotOf(completedRounds: number, playerIds: readonly string[]): GameSnapshot {
  return { completedRounds, players: playerIds.map(playerSnapshot) }
}

describe('GameRepository', () => {
  let dataDir: string
  let database: DatabaseSync
  let repository: GameRepository

  const red = identityFor('red')
  const blue = identityFor('blue')

  beforeEach(() => {
    dataDir = mkdtempSync(resolve(tmpdir(), 'robo-rally-'))
    execFileSync('dbmate', [
      '--url', `sqlite:${resolve(dataDir, DATABASE_FILE_NAME)}`,
      '--migrations-dir', MIGRATIONS_DIR,
      '--no-dump-schema',
      'up',
    ], { stdio: 'pipe' })
    database = openDatabase(dataDir)
    repository = createGameRepository(database)
  })

  afterEach(() => {
    database.close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  function gameRow() {
    return database.prepare('SELECT * FROM games WHERE id = ?').get('game-1')!
  }

  function playerRows() {
    return database.prepare('SELECT * FROM game_players WHERE game_id = ? ORDER BY player_id').all('game-1')
  }

  function storedState() {
    return JSON.parse(gameRow().state as string)
  }

  function saveFirstRound() {
    repository.saveRound('game-1', 'Friday night', 'test-map', snapshotOf(0, ['red', 'blue']), [red, blue])
  }

  it('creates the game and a row per player on its first write', () => {
    saveFirstRound()

    expect(gameRow()).toMatchObject({
      name: 'Friday night',
      map_name: 'test-map',
      status: 'in_progress',
      round_count: 0,
      schema_version: SCHEMA_VERSION,
      finished_at: null,
      winner_player_id: null,
    })
    expect(storedState()).toEqual({ snapshot: snapshotOf(0, ['red', 'blue']), identities: [red, blue] })
    expect(playerRows()).toEqual([
      { game_id: 'game-1', player_id: 'blue', user_id: 'user-blue', left_at: null },
      { game_id: 'game-1', player_id: 'red', user_id: 'user-red', left_at: null },
    ])
  })

  it('replaces the state and the round count at a round boundary', () => {
    saveFirstRound()

    repository.saveRound('game-1', 'Friday night', 'test-map', snapshotOf(3, ['red', 'blue']), [red, blue])

    expect(gameRow()).toMatchObject({ status: 'in_progress', round_count: 3 })
    expect(storedState().snapshot.completedRounds).toBe(3)
  })

  it('leaves the name, the map and the creation time to the first write', () => {
    saveFirstRound()
    const created = gameRow()

    repository.saveRound('game-1', 'Renamed', 'empty-map', snapshotOf(1, ['red', 'blue']), [red, blue])

    expect(gameRow()).toMatchObject({
      name: 'Friday night',
      map_name: 'test-map',
      created_at: created.created_at,
    })
  })

  it('records the winner and the final state together', () => {
    saveFirstRound()

    repository.saveFinished('game-1', 'Friday night', 'test-map', snapshotOf(7, ['red', 'blue']), [red, blue], 'red')

    const row = gameRow()
    expect(row).toMatchObject({ status: 'finished', winner_player_id: 'red', round_count: 7 })
    expect(row.finished_at).toEqual(expect.any(Number))
    expect(storedState().snapshot.completedRounds).toBe(7)
  })

  it('keeps the last good state when a game is aborted', () => {
    saveFirstRound()
    const before = storedState()

    repository.saveAborted('game-1')

    const row = gameRow()
    expect(row).toMatchObject({ status: 'aborted' })
    expect(row.finished_at).toEqual(expect.any(Number))
    expect(storedState()).toEqual(before)
  })

  it('never drops a player row when the roster shrinks', () => {
    saveFirstRound()

    repository.markPlayerLeft('game-1', 'blue')
    repository.saveRound('game-1', 'Friday night', 'test-map', snapshotOf(1, ['red']), [red])

    expect(storedState().identities).toEqual([red])
    const rows = playerRows()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ player_id: 'blue', left_at: expect.any(Number) })
    expect(rows[1]).toMatchObject({ player_id: 'red', left_at: null })
  })
})
