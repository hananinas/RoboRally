import { expectTypeOf, test } from 'vitest'
import type { GearRotation, Tile } from '../src/index.js'

test('gears require a valid rotation and retain common tile properties', () => {
  const clockwise = {
    position: { x: 1, y: 2 }, type: 'GEAR', rotation: 'CLOCKWISE', walls: ['NORTH'],
  } satisfies Tile
  const counterclockwise = {
    position: { x: 2, y: 2 }, type: 'GEAR', rotation: 'COUNTERCLOCKWISE',
  } satisfies Tile
  expectTypeOf(clockwise).toMatchTypeOf<Tile>()
  expectTypeOf(counterclockwise).toMatchTypeOf<Tile>()
  expectTypeOf<Extract<Tile, { type: 'GEAR' }>['rotation']>().toEqualTypeOf<GearRotation>()
  expectTypeOf<{ position: { x: number; y: number }; type: 'GEAR' }>().not.toMatchTypeOf<Tile>()
  expectTypeOf<{
    position: { x: number; y: number }; type: 'GEAR'; rotation: 'INVALID'
  }>().not.toMatchTypeOf<Tile>()
})

test('other tile types exclude rotation, including through existing objects', () => {
  const empty = { position: { x: 0, y: 0 }, type: 'EMPTY', walls: ['SOUTH'], checkpointNumber: 1 } satisfies Tile
  const pit = { position: { x: 1, y: 0 }, type: 'PIT', walls: ['WEST'] } satisfies Tile
  const invalidEmpty = { ...empty, rotation: 'CLOCKWISE' } as const
  const invalidPit = { ...pit, rotation: 'COUNTERCLOCKWISE' } as const

  expectTypeOf(empty).toMatchTypeOf<Tile>()
  expectTypeOf(pit).toMatchTypeOf<Tile>()
  expectTypeOf(invalidEmpty).not.toMatchTypeOf<Tile>()
  expectTypeOf(invalidPit).not.toMatchTypeOf<Tile>()
})

test('checking the tile type narrows rotation to GearRotation', () => {
  function rotationOf(tile: Tile) {
    if (tile.type === 'GEAR') {
      expectTypeOf(tile.rotation).toEqualTypeOf<GearRotation>()
      return tile.rotation
    }
    expectTypeOf(tile.rotation).toEqualTypeOf<undefined>()
    return undefined
  }
  expectTypeOf(rotationOf).returns.toEqualTypeOf<GearRotation | undefined>()
})
