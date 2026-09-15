import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Coordinate, Position, Tile } from '../src/index.js'

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
})
