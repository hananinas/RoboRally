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
      roundNumber: 1,
      antenna: { x: 0, y: 0, angle: Math.PI / 2 },
      board: { width: 1, height: 1, tiles: [] },
      robots: [],
      phase: 'PROGRAMMING',
  players: [],
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
