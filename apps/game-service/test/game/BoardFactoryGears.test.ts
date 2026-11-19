import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GearSpec } from '@/game/boardMaps'
import { Direction, GearTile, createBoard } from '@/game/index'
import { Integer } from '@/numbers'

const gears = vi.hoisted(() => [] as GearSpec[])

vi.mock('@/game/boardMaps', async (importOriginal) => {
  const { boardMaps } = await importOriginal<typeof import('@/game/boardMaps')>()
  return { boardMaps: { ...boardMaps, 'test-map': { ...boardMaps['test-map'], gears } } }
})

describe('board factory gear fixtures', () => {
  beforeEach(() => { gears.length = 0 })

  it('creates both gear directions and preserves their walls', () => {
    gears.push(
      { at: [4, 1], rotation: 'CLOCKWISE' },
      { at: [6, 2], rotation: 'COUNTERCLOCKWISE' },
    )
    const board = createBoard('test-map')

    for (const { at: [x, y], rotation } of gears) {
      const tile = board.getTile({ x: Integer(x), y: Integer(y) })
      expect(tile).toBeInstanceOf(GearTile)
      expect(tile).toMatchObject({ kind: 'GEAR', rotation })
      expect(tile?.checkpointNumber).toBeUndefined()
    }
    expect(board.getTile({ x: Integer(4), y: Integer(1) })?.walls).toEqual(new Set([Direction.NORTH, Direction.WEST]))
    expect(board.getTile({ x: Integer(6), y: Integer(2) })?.walls).toEqual(new Set([Direction.SOUTH, Direction.EAST]))
    expect(board.checkpointCount).toBe(2)
  })

  it.each([
    { location: 'outside the board', at: [-1, 1] },
    { location: 'beyond the last row', at: [0, 15] },
    { location: 'on a pit', at: [3, 3] },
    { location: 'on a checkpoint', at: [10, 6] },
  ] as const)('rejects a gear $location', ({ at }) => {
    gears.push({ at, rotation: 'CLOCKWISE' })
    expect(() => createBoard('test-map')).toThrow('must occupy an empty non-checkpoint board tile')
  })

  it('rejects multiple gears on the same tile', () => {
    gears.push(
      { at: [4, 1], rotation: 'CLOCKWISE' },
      { at: [4, 1], rotation: 'COUNTERCLOCKWISE' },
    )
    expect(() => createBoard('test-map')).toThrow('must occupy an empty non-checkpoint board tile')
  })
})
