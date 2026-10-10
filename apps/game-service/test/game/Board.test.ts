import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile } from '@/game/index.ts'
import type { Position } from '@/game/index.ts'
import { Integer, PositiveInteger } from '@/numbers'

function grid(width = 3, height = 3): EmptyTile[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => new EmptyTile()),
  )
}

const steps: { direction: Direction; target: Position; opposite: Direction }[] = [
  { direction: Direction.NORTH, target: { x: Integer(1), y: Integer(0) }, opposite: Direction.SOUTH },
  { direction: Direction.EAST, target: { x: Integer(2), y: Integer(1) }, opposite: Direction.WEST },
  { direction: Direction.SOUTH, target: { x: Integer(1), y: Integer(2) }, opposite: Direction.NORTH },
  { direction: Direction.WEST, target: { x: Integer(0), y: Integer(1) }, opposite: Direction.EAST },
]

describe('Tile and Board layout', () => {
  it('keeps walls on tile edges without a separate wall tile', () => {
    const walls = new Set([Direction.NORTH])
    const tile = new EmptyTile(walls)
    walls.clear()

    expect(tile.hasWall(Direction.NORTH)).toBe(true)
    expect(tile.hasWall(Direction.EAST)).toBe(false)
    expect(new EmptyTile().walls.size).toBe(0)

    const exposedWalls = tile.walls as Set<Direction>
    exposedWalls.clear()
    expect(tile.hasWall(Direction.NORTH)).toBe(true)
  })

  it('requires a rectangular grid and copies its rows', () => {
    expect(() => new Board([])).toThrow(RangeError)
    expect(() => new Board([[]])).toThrow(RangeError)
    expect(() => new Board([[new EmptyTile()], []])).toThrow(RangeError)

    const tiles = grid(2, 2)
    const original = tiles[0][0]
    const board = new Board(tiles)
    tiles[0][0] = new EmptyTile([Direction.EAST])
    tiles.pop()

    expect(board.width).toBe(2)
    expect(board.height).toBe(2)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(original)
    expect(board.getTile({ x: Integer(1), y: Integer(1) })).toBeInstanceOf(EmptyTile)
  })

  it('rejects positions outside the grid', () => {
    const board = new Board(grid())
    for (const position of [
      { x: Integer(-1), y: Integer(0) },
      { x: Integer(3), y: Integer(0) },
      { x: Integer(0), y: Integer(3) },
    ]) {
      expect(board.contains(position)).toBe(false)
      expect(board.getTile(position)).toBeUndefined()
    }
  })
})

describe('Board robot ownership', () => {
  it('places robots, answers occupancy, and does not expose mutable positions', () => {
    const board = new Board(grid())
    const placement = { x: Integer(1), y: Integer(1) }
    board.placeRobot('alpha', placement)
    placement.x = Integer(2)

    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBe('alpha')
    expect(board.occupantAt({ x: Integer(2), y: Integer(1) })).toBeUndefined()

    const returnedPosition = board.positionOf('alpha') as { x: number; y: number }
    returnedPosition.x = 0
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('rejects duplicate, occupied, and out-of-bounds placements', () => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: Integer(1), y: Integer(1) })

    expect(() => board.placeRobot('alpha', { x: Integer(2), y: Integer(2) })).toThrow()
    expect(() => board.placeRobot('beta', { x: Integer(1), y: Integer(1) })).toThrow()
    expect(() => board.placeRobot('beta', { x: Integer(3), y: Integer(1) })).toThrow(RangeError)
    expect(() => board.positionOf('beta')).toThrow()
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it.each(steps)('moves one tile $direction and updates occupancy', ({ direction, target }) => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: Integer(1), y: Integer(1) })

    expect(board.moveRobot('alpha', direction, PositiveInteger(1))).toEqual({
      position: target,
      stepsMoved: 1,
      blocked: false,
    })
    expect(board.positionOf('alpha')).toEqual(target)
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
    expect(board.occupantAt(target)).toBe('alpha')
  })

  it.each(steps)('blocks $direction when either tile has a wall', ({ direction, target, opposite }) => {
    for (const wallPosition of ['source', 'destination'] as const) {
      const tiles = grid()
      if (wallPosition === 'source') {
        tiles[1][1] = new EmptyTile([direction])
      } else {
        tiles[target.y][target.x] = new EmptyTile([opposite])
      }
      const board = new Board(tiles)
      board.placeRobot('alpha', { x: Integer(1), y: Integer(1) })

      expect(board.moveRobot('alpha', direction, PositiveInteger(1))).toEqual({
        position: { x: 1, y: 1 },
        stepsMoved: 0,
        blocked: true,
      })
      expect(board.occupantAt(target)).toBeUndefined()
    }
  })

  it('blocks at board edges and occupied tiles without moving either robot', () => {
    const board = new Board(grid(2, 1))
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })
    board.placeRobot('beta', { x: Integer(1), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.WEST, PositiveInteger(1)).blocked).toBe(true)
    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(1)).blocked).toBe(true)
    expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
    expect(board.positionOf('beta')).toEqual({ x: 1, y: 0 })
  })

  it('stops a multi-step move at the first blocked boundary', () => {
    const board = new Board(grid(3, 1))
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })
    board.placeRobot('beta', { x: Integer(2), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(2))).toEqual({
      position: { x: 1, y: 0 },
      stepsMoved: 1,
      blocked: true,
    })
    expect(board.occupantAt({ x: Integer(1), y: Integer(0) })).toBe('alpha')
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBe('beta')
  })

  it('rejects invalid movement requests without changing state', () => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: Integer(1), y: Integer(1) })

    expect(() => board.moveRobot('unknown', Direction.NORTH, PositiveInteger(1))).toThrow()
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('moves multiple steps successfully without blocking', () => {
    const board = new Board(grid(4, 1))
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(3))).toEqual({
      position: { x: 3, y: 0 },
      stepsMoved: 3,
      blocked: false,
    })
    expect(board.positionOf('alpha')).toEqual({ x: 3, y: 0 })
  })

  it('stops at board edge during multi-step move', () => {
    const board = new Board(grid(3, 1))
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(5))).toEqual({
      position: { x: 2, y: 0 },
      stepsMoved: 2,
      blocked: true,
    })
    expect(board.positionOf('alpha')).toEqual({ x: 2, y: 0 })
  })
})
