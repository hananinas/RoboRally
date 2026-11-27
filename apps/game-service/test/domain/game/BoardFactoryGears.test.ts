import { describe, expect, it } from 'vitest'
import { boardMaps, type GearSpec } from '@/domain/game/boardMaps'
import { Direction, GearTile, createBoard } from '@/domain/game/index'
import { Integer } from '@/numbers'

function boardWithGears(gears: readonly GearSpec[]) {
  return createBoard({ ...boardMaps['test-map'], gears })
}

describe('board factory gear fixtures', () => {
  it('creates both gear directions and preserves their walls', () => {
    const gears: readonly GearSpec[] = [
      { at: [4, 1], rotation: 'CLOCKWISE' },
      { at: [6, 2], rotation: 'COUNTERCLOCKWISE' },
    ]
    const board = boardWithGears(gears)

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
    expect(() => boardWithGears([{ at, rotation: 'CLOCKWISE' }]))
      .toThrow('must occupy an empty non-checkpoint board tile')
  })

  it('rejects multiple gears on the same tile', () => {
    expect(() => boardWithGears([
      { at: [4, 1], rotation: 'CLOCKWISE' },
      { at: [4, 1], rotation: 'COUNTERCLOCKWISE' },
    ])).toThrow('must occupy an empty non-checkpoint board tile')
  })
})
