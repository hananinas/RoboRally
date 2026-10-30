import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, PitTile, ConveyorTile } from '@/game/index.ts'
import type { Position, Tile, TileKind } from '@/game/index.ts'
import { Integer, PositiveInteger } from '@/numbers'

const antenna = { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }

function grid(width = 3, height = 3): Tile[][] {
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
  it('stores pits with walls without counting them as checkpoints', () => {
    const pit = new PitTile([Direction.NORTH])
    const board = new Board([[pit, new EmptyTile([], 1), new PitTile()]], antenna)

    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(pit)
    expect(pit.hasWall(Direction.NORTH)).toBe(true)
    expect(pit.checkpointNumber).toBeUndefined()
    expect(board.checkpointCount).toBe(1)
  })

  it('stores checkpoint state alongside walls and derives the total from the grid', () => {
    const checkpoint = new EmptyTile([Direction.NORTH], 2)
    const first = new EmptyTile([], 1)
    const empty = new EmptyTile()
    const board = new Board([[checkpoint, empty, first]], antenna)

    expect(checkpoint.checkpointNumber).toBe(2)
    expect(checkpoint.hasWall(Direction.NORTH)).toBe(true)
    expect(empty.checkpointNumber).toBeUndefined()
    expect(board.checkpointCount).toBe(2)
    expect(new Board([[empty]], antenna).checkpointCount).toBe(0)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(checkpoint)
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid checkpoint number %s',
    (number) => expect(() => new EmptyTile([], number)).toThrow(RangeError),
  )

  it('rejects duplicate or skipped checkpoint numbers', () => {
    for (const numbers of [[1, 1], [1, 3], [2]]) {
      expect(() => new Board(
        [numbers.map((number) => new EmptyTile([], number))],
        antenna,
      )).toThrow(RangeError)
    }
  })

  it('keeps checkpoints available when different robots occupy and leave their tiles', () => {
    const board = new Board([[new EmptyTile([], 1), new EmptyTile([], 2)]], antenna)
    for (const robotId of ['alpha', 'beta']) {
      board.placeRobot(robotId, { x: Integer(0), y: Integer(0) })
      expect(board.moveRobot(robotId, Direction.EAST, PositiveInteger(1))).toEqual({
        position: { x: 1, y: 0 }, stepsMoved: 1, blocked: false,
      })
      board.removeRobot(robotId)
      expect(board.getTile({ x: Integer(0), y: Integer(0) })?.checkpointNumber).toBe(1)
      expect(board.getTile({ x: Integer(1), y: Integer(0) })?.checkpointNumber).toBe(2)
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
    expect(() => new Board([], antenna)).toThrow(RangeError)
    expect(() => new Board([[]], antenna)).toThrow(RangeError)
    expect(() => new Board([[new EmptyTile()], []], antenna)).toThrow(RangeError)

    const tiles = grid(2, 2)
    const original = tiles[0][0]
    const board = new Board(tiles, antenna)
    tiles[0][0] = new EmptyTile([Direction.EAST])
    tiles.pop()

    expect(board.width).toBe(2)
    expect(board.height).toBe(2)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(original)
    expect(board.getTile({ x: Integer(1), y: Integer(1) })).toBeInstanceOf(EmptyTile)
  })

  it('keeps an independent, frozen copy of its antenna', () => {
    const source = { x: Integer(1), y: Integer(2), angle: Math.PI / 2 }
    const board = new Board(grid(), source)
    source.x = Integer(0)
    source.angle = 0

    expect(board.antenna).toEqual({ x: 1, y: 2, angle: Math.PI / 2 })
    expect(() => Object.assign(board.antenna, { angle: 0 })).toThrow()
  })

  it('requires the antenna to be on the board with a finite angle', () => {
    for (const invalid of [
      { x: Integer(-1), y: Integer(0), angle: 0 },
      { x: Integer(3), y: Integer(0), angle: 0 },
      { x: Integer(0), y: Integer(3), angle: 0 },
      { x: Integer(0), y: Integer(0), angle: Infinity },
      { x: Integer(0), y: Integer(0), angle: NaN },
    ]) {
      expect(() => new Board(grid(), invalid)).toThrow(RangeError)
    }
  })

  it('rejects positions outside the grid or between tiles', () => {
    const board = new Board(grid(), antenna)
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
  const destinations: Record<TileKind, { tile: Tile; canOccupy: boolean; entryEffect?: 'reboot' }> = {
    EMPTY: { tile: new EmptyTile(), canOccupy: true },
    PIT: { tile: new PitTile(), canOccupy: false, entryEffect: 'reboot' },
    CONVEYOR: { tile: new ConveyorTile('conveyor-1-straight', Direction.NORTH), canOccupy: true },
  }

  it.each(Object.entries(destinations))('uses %s rules for placement, relocation and safe destinations', (kind, { tile, canOccupy, entryEffect }) => {
    const board = new Board([[new EmptyTile(), tile]], antenna)
    const start = { x: Integer(0), y: Integer(0) }
    const destination = { x: Integer(1), y: Integer(0) }
    board.placeRobot('alpha', start)

    expect(tile.kind).toBe(kind)
    expect(board.hasEntryEffect('reboot')).toBe(entryEffect === 'reboot')
    expect(board.nearestFreePosition(destination)).toEqual(canOccupy ? destination : undefined)
    if (canOccupy) {
      board.placeRobot('beta', destination)
      board.removeRobot('beta')
      board.relocateRobot('alpha', destination)
      expect(board.positionOf('alpha')).toEqual(destination)
      expect(board.occupantAt(start)).toBeUndefined()
    } else {
      expect(() => board.placeRobot('beta', destination)).toThrow(RangeError)
      expect(() => board.positionOf('beta')).toThrow()
      expect(() => board.relocateRobot('alpha', destination)).toThrow(RangeError)
      expect(board.positionOf('alpha')).toEqual(start)
      expect(board.occupantAt(destination)).toBeUndefined()
    }
  })

  it('relocates a robot without retaining its old occupancy or the supplied position', () => {
    const board = new Board(grid(), antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })
    const destination = { x: Integer(2), y: Integer(2) }

    board.relocateRobot('alpha', destination)
    destination.x = Integer(0)

    expect(board.positionOf('alpha')).toEqual({ x: 2, y: 2 })
    expect(board.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(2), y: Integer(2) })).toBe('alpha')
    expect(() => board.relocateRobot('alpha', { x: Integer(2), y: Integer(2) })).not.toThrow()
  })

  it('rejects unsafe relocation without changing either robot', () => {
    const board = new Board([[new EmptyTile(), new EmptyTile(), new PitTile()]], antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })
    board.placeRobot('beta', { x: Integer(1), y: Integer(0) })

    for (const destination of [
      { x: Integer(-1), y: Integer(0) }, { x: Integer(1), y: Integer(0) }, { x: Integer(2), y: Integer(0) },
    ]) {
      expect(() => board.relocateRobot('alpha', destination)).toThrow()
      expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
      expect(board.positionOf('beta')).toEqual({ x: 1, y: 0 })
    }
    expect(() => board.relocateRobot('unknown', { x: Integer(0), y: Integer(0) })).toThrow()
    expect(() => board.positionOf('unknown')).toThrow()
  })

  it('places robots, answers occupancy, and does not expose mutable positions', () => {
    const board = new Board(grid(), antenna)
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
    const board = new Board(grid(), antenna)
    board.placeRobot('alpha', { x: Integer(1), y: Integer(1) })

    expect(() => board.placeRobot('alpha', { x: Integer(2), y: Integer(2) })).toThrow()
    expect(() => board.placeRobot('beta', { x: Integer(1), y: Integer(1) })).toThrow()
    expect(() => board.placeRobot('beta', { x: Integer(3), y: Integer(1) })).toThrow(RangeError)
    expect(() => board.positionOf('beta')).toThrow()
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it.each(steps)('moves one tile $direction and updates occupancy', ({ direction, target }) => {
    const board = new Board(grid(), antenna)
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
      const board = new Board(tiles, antenna)
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
    const board = new Board(grid(2, 1), antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })
    board.placeRobot('beta', { x: Integer(1), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.WEST, PositiveInteger(1)).blocked).toBe(true)
    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(1)).blocked).toBe(true)
    expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
    expect(board.positionOf('beta')).toEqual({ x: 1, y: 0 })
  })

  it('stops a multi-step move at the first blocked boundary', () => {
    const board = new Board(grid(3, 1), antenna)
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

  it('moves spatially across pits without resolving entry effects', () => {
    const board = new Board([[new EmptyTile(), new PitTile(), new PitTile(), new EmptyTile()]], antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(3))).toEqual({
      position: { x: 3, y: 0 }, stepsMoved: 3, blocked: false,
    })
    expect(board.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(1), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(3), y: Integer(0) })).toBe('alpha')
  })

  it('remains blocked by another robot before reaching a pit', () => {
    const board = new Board([[new EmptyTile(), new EmptyTile(), new PitTile()]], antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })
    board.placeRobot('beta', { x: Integer(1), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(3))).toEqual({
      position: { x: 0, y: 0 }, stepsMoved: 0, blocked: true,
    })
    expect(board.occupantAt({ x: Integer(1), y: Integer(0) })).toBe('beta')
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBeUndefined()
  })

  it('rejects invalid movement requests without changing state', () => {
    const board = new Board(grid(), antenna)
    board.placeRobot('alpha', { x: Integer(1), y: Integer(1) })

    expect(() => board.moveRobot('unknown', Direction.NORTH, PositiveInteger(1))).toThrow()
    expect(board.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('moves multiple steps successfully without blocking', () => {
    const board = new Board(grid(4, 1), antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(3))).toEqual({
      position: { x: 3, y: 0 },
      stepsMoved: 3,
      blocked: false,
    })
    expect(board.positionOf('alpha')).toEqual({ x: 3, y: 0 })
  })

  it('stops at board edge during multi-step move', () => {
    const board = new Board(grid(3, 1), antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })

    expect(board.moveRobot('alpha', Direction.EAST, PositiveInteger(5))).toEqual({
      position: { x: 2, y: 0 },
      stepsMoved: 2,
      blocked: true,
    })
    expect(board.positionOf('alpha')).toEqual({ x: 2, y: 0 })
  })
})

describe('Board reboot destinations', () => {
  it('prefers the requested tile, then distance, then top-to-bottom and left-to-right order', () => {
    const board = new Board(grid(5, 5), antenna)
    const origin = { x: Integer(2), y: Integer(2) }
    expect(board.nearestFreePosition(origin)).toEqual(origin)
    board.placeRobot('centre', origin)

    expect(board.nearestFreePosition(origin)).toEqual({ x: 2, y: 1 })
    board.placeRobot('north', { x: Integer(2), y: Integer(1) })
    expect(board.nearestFreePosition(origin)).toEqual({ x: 1, y: 2 })
    board.placeRobot('west', { x: Integer(1), y: Integer(2) })
    expect(board.nearestFreePosition(origin)).toEqual({ x: 3, y: 2 })
    board.placeRobot('east', { x: Integer(3), y: Integer(2) })
    expect(board.nearestFreePosition(origin)).toEqual({ x: 2, y: 3 })
    expect(board.positionOf('centre')).toEqual(origin)
  })

  it('skips pits and occupied tiles while allowing destinations enclosed by walls', () => {
    const tiles = grid()
    tiles[0][1] = new PitTile()
    tiles[1][0] = new PitTile()
    tiles[2][1] = new EmptyTile([Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST])
    const board = new Board(tiles, antenna)
    board.placeRobot('centre', { x: Integer(1), y: Integer(1) })
    board.placeRobot('east', { x: Integer(2), y: Integer(1) })

    expect(board.nearestFreePosition({ x: Integer(1), y: Integer(1) })).toEqual({ x: Integer(1), y: Integer(2) })
  })

  it('returns no destination when every non-pit tile is occupied', () => {
    const board = new Board([[new EmptyTile(), new PitTile()]], antenna)
    board.placeRobot('alpha', { x: Integer(0), y: Integer(0) })

    expect(board.nearestFreePosition({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(board.positionOf('alpha')).toEqual({ x: 0, y: 0 })
  })
})
