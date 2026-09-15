import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Coordinate, Position, Tile } from '../src/index.js'

describe('game event payload types', () => {
  it('keeps tile coordinates separate from oriented robot positions', () => {
    const coordinate = { x: 2, y: 3 } satisfies Coordinate
    const tile = { position: coordinate, type: 'EMPTY' } satisfies Tile

    expectTypeOf<Tile['position']>().toEqualTypeOf<Coordinate>()
    expectTypeOf<Position>().toMatchTypeOf<Coordinate>()
    expectTypeOf<Coordinate>().not.toMatchTypeOf<Position>()
    expect(tile.position).toEqual({ x: 2, y: 3 })
  })
})
