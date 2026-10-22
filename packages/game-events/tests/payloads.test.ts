import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  Coordinate,
  Position,
  PublicGameState,
  Tile,
} from '../src/index.js'

describe('game event payload types', () => {
  it('keeps tile coordinates separate from oriented robot positions', () => {
    const coordinate = { x: 2, y: 3 } satisfies Coordinate
    const position = { coordinate, orientation: 'NORTH' } satisfies Position
    const tile = { position: coordinate, type: 'EMPTY' } satisfies Tile
    const pit = { position: coordinate, type: 'PIT', walls: ['NORTH'] } satisfies Tile

    expectTypeOf<Tile['type']>().toEqualTypeOf<'EMPTY' | 'PIT'>()
    expectTypeOf<Tile['position']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position['coordinate']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position>().not.toMatchTypeOf<Coordinate>()
    expectTypeOf<Coordinate>().not.toMatchTypeOf<Position>()
    expect(position).toEqual({ coordinate: { x: 2, y: 3 }, orientation: 'NORTH' })
    expect(tile.position).toEqual({ x: 2, y: 3 })
    expect(pit.position).toEqual({ x: 2, y: 3 })
  })

  it('constructs a public game state', () => {
    const state = {
      gameId: 'game',
      antenna: { x: 0, y: 0, angle: 0 },
      board: { width: 1, height: 1, tiles: [] },
      robots: [{
        robotId: 'robot',
        playerId: 'player',
        colour: 'red',
        position: { coordinate: { x: 0, y: 0 }, orientation: 'NORTH' },
      }],
      players: [{
        playerId: 'player',
        username: 'Ada',
        connected: true,
        programSubmitted: false,
        lastCheckpoint: 0,
        registers: [
          { status: 'REVEALED', instruction: 'MOVE_1' },
          { status: 'HIDDEN' },
          { status: 'EMPTY' },
          { status: 'EMPTY' },
          { status: 'EMPTY' },
        ],
      }],
      phase: 'PROGRAMMING',
      paused: false,
      aborted: false,
      checkpointCount: 0,
    } satisfies PublicGameState

    expect(state.robots[0]?.colour).toBe('red')
    expect(state.players[0]?.registers).toEqual([
      { status: 'REVEALED', instruction: 'MOVE_1' },
      { status: 'HIDDEN' },
      { status: 'EMPTY' },
      { status: 'EMPTY' },
      { status: 'EMPTY' },
    ])
    expect(JSON.stringify(state)).not.toContain('hand')
    expect(JSON.stringify(state)).not.toContain('cardId')
  })
})
