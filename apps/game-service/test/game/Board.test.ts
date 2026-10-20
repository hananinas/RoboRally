import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, PitTile } from '@/game/index.ts'
import type { Position } from '@/game/index.ts'

function grid(width = 3, height = 3): EmptyTile[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => new EmptyTile()),
  )
}

const steps: { direction: Direction; target: Position; opposite: Direction }[] = [
  { direction: Direction.NORTH, target: { x: 1, y: 0 }, opposite: Direction.SOUTH },
  { direction: Direction.EAST, target: { x: 2, y: 1 }, opposite: Direction.WEST },
  { direction: Direction.SOUTH, target: { x: 1, y: 2 }, opposite: Direction.NORTH },
  { direction: Direction.WEST, target: { x: 0, y: 1 }, opposite: Direction.EAST },
]

describe('Tile and Board layout', () => {
  it('stores pits with walls without counting them as checkpoints', () => {
    const pit = new PitTile([Direction.NORTH])
    const board = new Board([[pit, new EmptyTile([], 1), new PitTile()]])

    expect(board.getTile({ x: 0, y: 0 })).toBe(pit)
    expect(pit.hasWall(Direction.NORTH)).toBe(true)
    expect(pit.checkpointNumber).toBeUndefined()
    expect(board.checkpointCount).toBe(1)
  })

  it('stores checkpoint state alongside walls and derives the total from the grid', () => {
    const checkpoint = new EmptyTile([Direction.NORTH], 2)
    const first = new EmptyTile([], 1)
    const empty = new EmptyTile()
    const board = new Board([[checkpoint, empty, first]])

    expect(checkpoint.checkpointNumber).toBe(2)
    expect(checkpoint.hasWall(Direction.NORTH)).toBe(true)
    expect(empty.checkpointNumber).toBeUndefined()
    expect(board.checkpointCount).toBe(2)
    expect(new Board([[empty]]).checkpointCount).toBe(0)
    expect(board.getTile({ x: 0, y: 0 })).toBe(checkpoint)
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid checkpoint number %s',
    (number) => expect(() => new EmptyTile([], number)).toThrow(RangeError),
  )

  it('rejects duplicate or skipped checkpoint numbers', () => {
    for (const numbers of [[1, 1], [1, 3], [2]]) {
      expect(() => new Board([numbers.map((number) => new EmptyTile([], number))])).toThrow(RangeError)
    }
  })

  it('keeps checkpoints available when different robots occupy and leave their tiles', () => {
    const board = new Board([[new EmptyTile([], 1), new EmptyTile([], 2)]])
    for (const robotId of ['alpha', 'beta']) {
      board.placeRobot(robotId, { x: 0, y: 0 })
      expect(board.moveRobot(robotId, Direction.EAST, 1)).toEqual({
        position: { x: 1, y: 0 }, stepsMoved: 1, blocked: false,
      })
      board.removeRobot(robotId)
      expect(board.getTile({ x: 0, y: 0 })?.checkpointNumber).toBe(1)
      expect(board.getTile({ x: 1, y: 0 })?.checkpointNumber).toBe(2)
      expect(board.checkpointCount).toBe(2)
    }
  })

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
    expect(board.getTile({ x: 0, y: 0 })).toBe(original)
    expect(board.getTile({ x: 1, y: 1 })).toBeInstanceOf(EmptyTile)
  })

  it('rejects positions outside the grid or between tiles', () => {
    const board = new Board(grid())
    for (const position of [
      { x: -1, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 3 },
      { x: 0.5, y: 1 },
      { x: Number.NaN, y: 1 },
    ]) {
      expect(board.contains(position)).toBe(false)
      expect(board.getTile(position)).toBeUndefined()
    }
  })
})

describe('Board robot ownership', () => {
  it('rejects initial placement on pits without adding the robot', () => {
    const board = new Board([[new PitTile(), new EmptyTile()]])

    expect(() => board.placeRobot('alpha', { x: 0, y: 0 })).toThrow(RangeError)
    expect(board.occupantAt({ x: 0, y: 0 })).toBeUndefined()
    expect(() => board.positionOf('alpha')).toThrow()
  })

  it('relocates a robot without retaining its old occupancy or the supplied position', () => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: 0, y: 0 })
    const destination = { x: 2, y: 2 }

    board.relocateRobot('alpha', destination)
    destination.x = 0

    expect(board.positionOf('alpha')).toEqual({ x: 2, y: 2 })
    expect(board.occupantAt({ x: 0, y: 0 })).toBeUndefined()
    expect(board.occupantAt({ x: 2, y: 2 })).toBe('alpha')
    expect(() => board.relocateRobot('alpha', { x: 2, y: 2 })).not.toThrow()
  })

  it('rejects unsafe relocation without changing either robot', () => {
    const board = new Board([[new EmptyTile(), new EmptyTile(), new PitTile()]])
    board.placeRobot('alpha', { x: 0, y: 0 })
    board.placeRobot('beta', { x: 1, y: 0 })

    for (const destination of [
      { x: -1, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    ]) {
      expect(() => board.relocateRobot('alpha', destination)).toThrow()
      expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
      expect(board.positionOf('beta')).toEqual({ x: 1, y: 0 })
    }
    expect(() => board.relocateRobot('unknown', { x: 0, y: 0 })).toThrow()
    expect(() => board.positionOf('unknown')).toThrow()
  })

  it('places robots, answers occupancy, and does not expose mutable positions', () => {
    const board = new Board(grid())
    const placement = { x: 1, y: 1 }
    board.placeRobot('alpha', placement)
    placement.x = 2

    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
    expect(board.occupantAt({ x: 1, y: 1 })).toBe('alpha')
    expect(board.occupantAt({ x: 2, y: 1 })).toBeUndefined()

    const returnedPosition = board.positionOf('alpha') as { x: number; y: number }
    returnedPosition.x = 0
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('rejects duplicate, occupied, and out-of-bounds placements', () => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: 1, y: 1 })

    expect(() => board.placeRobot('alpha', { x: 2, y: 2 })).toThrow()
    expect(() => board.placeRobot('beta', { x: 1, y: 1 })).toThrow()
    expect(() => board.placeRobot('beta', { x: 3, y: 1 })).toThrow(RangeError)
    expect(() => board.positionOf('beta')).toThrow()
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it.each(steps)('moves one tile $direction and updates occupancy', ({ direction, target }) => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: 1, y: 1 })

    expect(board.moveRobot('alpha', direction, 1)).toEqual({
      position: target,
      stepsMoved: 1,
      blocked: false,
    })
    expect(board.positionOf('alpha')).toEqual(target)
    expect(board.occupantAt({ x: 1, y: 1 })).toBeUndefined()
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
      board.placeRobot('alpha', { x: 1, y: 1 })

      expect(board.moveRobot('alpha', direction, 1)).toEqual({
        position: { x: 1, y: 1 },
        stepsMoved: 0,
        blocked: true,
      })
      expect(board.occupantAt(target)).toBeUndefined()
    }
  })

  it('blocks at board edges and occupied tiles without moving either robot', () => {
    const board = new Board(grid(2, 1))
    board.placeRobot('alpha', { x: 0, y: 0 })
    board.placeRobot('beta', { x: 1, y: 0 })

    expect(board.moveRobot('alpha', Direction.WEST, 1).blocked).toBe(true)
    expect(board.moveRobot('alpha', Direction.EAST, 1).blocked).toBe(true)
    expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
    expect(board.positionOf('beta')).toEqual({ x: 1, y: 0 })
  })

  it('stops a multi-step move at the first blocked boundary', () => {
    const board = new Board(grid(3, 1))
    board.placeRobot('alpha', { x: 0, y: 0 })
    board.placeRobot('beta', { x: 2, y: 0 })

    expect(board.moveRobot('alpha', Direction.EAST, 2)).toEqual({
      position: { x: 1, y: 0 },
      stepsMoved: 1,
      blocked: true,
    })
    expect(board.occupantAt({ x: 1, y: 0 })).toBe('alpha')
    expect(board.occupantAt({ x: 2, y: 0 })).toBe('beta')
  })

  it('rejects invalid movement requests without changing state', () => {
    const board = new Board(grid())
    board.placeRobot('alpha', { x: 1, y: 1 })

    expect(() => board.moveRobot('alpha', Direction.NORTH, 0)).toThrow(RangeError)
    expect(() => board.moveRobot('alpha', Direction.NORTH, 1.5)).toThrow(RangeError)
    expect(() => board.moveRobot('unknown', Direction.NORTH, 1)).toThrow()
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('moves multiple steps successfully without blocking', () => {
    const board = new Board(grid(4, 1))
    board.placeRobot('alpha', { x: 0, y: 0 })

    expect(board.moveRobot('alpha', Direction.EAST, 3)).toEqual({
      position: { x: 3, y: 0 },
      stepsMoved: 3,
      blocked: false,
    })
    expect(board.positionOf('alpha')).toEqual({ x: 3, y: 0 })
  })

  it('stops at board edge during multi-step move', () => {
    const board = new Board(grid(3, 1))
    board.placeRobot('alpha', { x: 0, y: 0 })

    expect(board.moveRobot('alpha', Direction.EAST, 5)).toEqual({
      position: { x: 2, y: 0 },
      stepsMoved: 2,
      blocked: true,
    })
    expect(board.positionOf('alpha')).toEqual({ x: 2, y: 0 })
  })
})

describe('Board reboot destinations', () => {
  it('prefers the requested tile, then distance, then top-to-bottom and left-to-right order', () => {
    const board = new Board(grid(5, 5))
    const origin = { x: 2, y: 2 }
    expect(board.nearestFreePosition(origin)).toEqual(origin)
    board.placeRobot('centre', origin)

    expect(board.nearestFreePosition(origin)).toEqual({ x: 2, y: 1 })
    board.placeRobot('north', { x: 2, y: 1 })
    expect(board.nearestFreePosition(origin)).toEqual({ x: 1, y: 2 })
    board.placeRobot('west', { x: 1, y: 2 })
    expect(board.nearestFreePosition(origin)).toEqual({ x: 3, y: 2 })
    board.placeRobot('east', { x: 3, y: 2 })
    expect(board.nearestFreePosition(origin)).toEqual({ x: 2, y: 3 })
    expect(board.positionOf('centre')).toEqual(origin)
  })

  it('skips pits and occupied tiles while allowing destinations enclosed by walls', () => {
    const tiles = grid()
    tiles[0][1] = new PitTile()
    tiles[1][0] = new PitTile()
    tiles[2][1] = new EmptyTile([Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST])
    const board = new Board(tiles)
    board.placeRobot('centre', { x: 1, y: 1 })
    board.placeRobot('east', { x: 2, y: 1 })

    expect(board.nearestFreePosition({ x: 1, y: 1 })).toEqual({ x: 1, y: 2 })
  })

  it('returns no destination when every non-pit tile is occupied', () => {
    const board = new Board([[new EmptyTile(), new PitTile()]])
    board.placeRobot('alpha', { x: 0, y: 0 })

    expect(board.nearestFreePosition({ x: 0, y: 0 })).toBeUndefined()
    expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
  })
})
