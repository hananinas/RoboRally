import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  Coordinate,
  Position,
  PublicGameState,
  PublicGameStateResult,
  Tile,
} from '../src/index.js'

describe('game event payload types', () => {
  it('keeps tile coordinates separate from oriented robot positions', () => {
    const coordinate = { x: 2, y: 3 } satisfies Coordinate
    const position = { coordinate, orientation: 'NORTH' } satisfies Position
    const tile = { position: coordinate, type: 'EMPTY' } satisfies Tile

    expectTypeOf<Tile['position']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position['coordinate']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position>().not.toMatchTypeOf<Coordinate>()
    expectTypeOf<Coordinate>().not.toMatchTypeOf<Position>()
    expect(position).toEqual({ coordinate: { x: 2, y: 3 }, orientation: 'NORTH' })
    expect(tile.position).toEqual({ x: 2, y: 3 })
  })

  it('distinguishes a public game state from an unknown game', () => {
    const state = {
      gameId: 'game',
      antenna: { x: 0, y: 0, angle: 0 },
      board: { width: 1, height: 1, tiles: [] },
      robots: [],
      players: [],
      phase: 'PROGRAMMING',
      paused: false,
      checkpointCount: 0,
    } satisfies PublicGameState
    const found = {
      outcome: 'GAME_FOUND',
      state,
    } satisfies PublicGameStateResult
    const notFound = {
      outcome: 'GAME_NOT_FOUND',
    } satisfies PublicGameStateResult

    expect(found.state).toBe(state)
    expect(notFound.outcome).toBe('GAME_NOT_FOUND')
  })
})
