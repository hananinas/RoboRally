import { describe, expect, it } from 'vitest'
import { Direction, EmptyTile, PitTile, ConveyorTile, GearTile, RebootTile, RobotPlacements, StartTile } from '@/domain/game/index.ts'
import { PUSH_LIMIT } from '@/domain/game/RobotPlacements'
import type { Position, Tile, TileKind } from '@/domain/game/index.ts'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestBoard } from '../../fixtures.ts'

const antenna = { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }
const rebootTile = { x: Integer(2), y: Integer(2) }

const steps: { direction: Direction; target: Position; opposite: Direction }[] = [
  { direction: Direction.NORTH, target: { x: Integer(1), y: Integer(0) }, opposite: Direction.SOUTH },
  { direction: Direction.EAST, target: { x: Integer(2), y: Integer(1) }, opposite: Direction.WEST },
  { direction: Direction.SOUTH, target: { x: Integer(1), y: Integer(2) }, opposite: Direction.NORTH },
  { direction: Direction.WEST, target: { x: Integer(0), y: Integer(1) }, opposite: Direction.EAST },
]

describe('robot ownership', () => {
  const destinations: Record<TileKind, { tile: Tile; canOccupy: boolean }> = {
    EMPTY: { tile: new EmptyTile(), canOccupy: true },
    PIT: { tile: new PitTile(), canOccupy: false},
    GEAR: { tile: new GearTile('CLOCKWISE'), canOccupy: true },
    CONVEYOR: { tile: new ConveyorTile('conveyor-1-straight', Direction.NORTH), canOccupy: true },
    REBOOT: { tile: new RebootTile(), canOccupy: true },
    START: { tile: new StartTile(1), canOccupy: true },
  }

  it.each(Object.entries(destinations))('uses %s rules for placement, relocation and safe destinations', (kind, { tile, canOccupy }) => {
    const board = createTestBoard([[new EmptyTile(), tile, new EmptyTile()]], { ...antenna, x: Integer(2) }, { x: Integer(0), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    const start = { x: Integer(0), y: Integer(0) }
    const destination = { x: Integer(1), y: Integer(0) }
    robotPlacements.place('alpha', start)

    expect(tile.kind).toBe(kind)
    expect(robotPlacements.nearestFreePosition(destination)).toEqual(canOccupy ? destination : undefined)
    if (canOccupy) {
      robotPlacements.place('beta', destination)
      robotPlacements.remove('beta')
      robotPlacements.relocate('alpha', destination)
      expect(robotPlacements.positionOf('alpha')).toEqual(destination)
      expect(robotPlacements.occupantAt(start)).toBeUndefined()
    } else {
      expect(() => robotPlacements.place('beta', destination)).toThrow(RangeError)
      expect(() => robotPlacements.positionOf('beta')).toThrow()
      expect(() => robotPlacements.relocate('alpha', destination)).toThrow(RangeError)
      expect(robotPlacements.positionOf('alpha')).toEqual(start)
      expect(robotPlacements.occupantAt(destination)).toBeUndefined()
    }
  })

  it('relocates a robot without retaining its old occupancy or the supplied position', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), { ...antenna, x: Integer(2) }, { x: Integer(0), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(0), y: Integer(0) })
    const destination = { x: Integer(2), y: Integer(2) }

    robotPlacements.relocate('alpha', destination)
    destination.x = Integer(0)

    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 2, y: 2 })
    expect(robotPlacements.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(robotPlacements.occupantAt({ x: Integer(2), y: Integer(2) })).toBe('alpha')
    expect(() => robotPlacements.relocate('alpha', { x: Integer(2), y: Integer(2) })).not.toThrow()
  })

  it('rejects unsafe relocation without changing either robot', () => {
    const board = createTestBoard([
      [new EmptyTile(), new EmptyTile(), new PitTile()],
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], { ...antenna, y: Integer(1) }, { x: Integer(1), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(0), y: Integer(0) })
    robotPlacements.place('beta', { x: Integer(1), y: Integer(0) })

    for (const destination of [
      { x: Integer(-1), y: Integer(0) }, { x: Integer(1), y: Integer(0) }, { x: Integer(2), y: Integer(0) },
    ]) {
      expect(() => robotPlacements.relocate('alpha', destination)).toThrow()
      expect(robotPlacements.positionOf('alpha')).toEqual({ x: 0, y: 0 })
      expect(robotPlacements.positionOf('beta')).toEqual({ x: 1, y: 0 })
    }
    expect(() => robotPlacements.relocate('unknown', { x: Integer(0), y: Integer(0) })).toThrow()
    expect(() => robotPlacements.positionOf('unknown')).toThrow()
  })

  it('places robots, answers occupancy, and does not expose mutable positions', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), antenna, rebootTile)
    const robotPlacements = new RobotPlacements(board)
    const placement = { x: Integer(1), y: Integer(1) }
    robotPlacements.place('alpha', placement)
    placement.x = Integer(2)

    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 1 })
    expect(robotPlacements.occupantAt({ x: Integer(1), y: Integer(1) })).toBe('alpha')
    expect(robotPlacements.occupantAt({ x: Integer(2), y: Integer(1) })).toBeUndefined()

    const returnedPosition = robotPlacements.positionOf('alpha') as { x: number; y: number }
    returnedPosition.x = 0
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('rejects duplicate, occupied, and out-of-bounds placements', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), antenna, rebootTile)
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(1), y: Integer(1) })

    expect(() => robotPlacements.place('alpha', { x: Integer(2), y: Integer(2) })).toThrow()
    expect(() => robotPlacements.place('beta', { x: Integer(1), y: Integer(1) })).toThrow()
    expect(() => robotPlacements.place('beta', { x: Integer(3), y: Integer(1) })).toThrow(RangeError)
    expect(() => robotPlacements.positionOf('beta')).toThrow()
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it.each(steps)('moves one tile $direction and updates occupancy', ({ direction, target }) => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), antenna, rebootTile)
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(1), y: Integer(1) })

    expect(robotPlacements.push('alpha', direction)).toEqual(['alpha'])
    expect(robotPlacements.positionOf('alpha')).toEqual(target)
    expect(robotPlacements.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
    expect(robotPlacements.occupantAt(target)).toBe('alpha')
  })

  it.each(steps)('blocks $direction when either tile has a wall', ({ direction, target, opposite }) => {
    for (const wallPosition of ['source', 'destination'] as const) {
      const tiles = createEmptyTileGrid(3, 3)
      if (wallPosition === 'source') {
        tiles[1][1] = new EmptyTile([direction])
      } else {
        tiles[target.y][target.x] = new EmptyTile([opposite])
      }
      const board = createTestBoard(tiles, antenna, rebootTile)
      const robotPlacements = new RobotPlacements(board)
      robotPlacements.place('alpha', { x: Integer(1), y: Integer(1) })

      expect(robotPlacements.push('alpha', direction)).toEqual([])
      expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 1 })
      expect(robotPlacements.occupantAt({ x: Integer(1), y: Integer(1) })).toBe('alpha')
      expect(robotPlacements.occupantAt(target)).toBeUndefined()
    }
  })

  it('pushes an occupying robot and returns displaced robots farthest first', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 2), { ...antenna, y: Integer(1) }, { x: Integer(2), y: Integer(1) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(0), y: Integer(0) })
    robotPlacements.place('beta', { x: Integer(1), y: Integer(0) })

    expect(robotPlacements.push('alpha', Direction.EAST)).toEqual(['beta', 'alpha'])
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 0 })
    expect(robotPlacements.positionOf('beta')).toEqual({ x: 2, y: 0 })
    expect(robotPlacements.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(robotPlacements.occupantAt({ x: Integer(1), y: Integer(0) })).toBe('alpha')
    expect(robotPlacements.occupantAt({ x: Integer(2), y: Integer(0) })).toBe('beta')
  })

  it('blocks the whole step when more than PUSH_LIMIT robots are in the way', () => {
    expect(PUSH_LIMIT).toBe(1)
    const board = createTestBoard(createEmptyTileGrid(4, 2), { ...antenna, y: Integer(1) }, { x: Integer(3), y: Integer(1) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(0), y: Integer(0) })
    robotPlacements.place('beta', { x: Integer(1), y: Integer(0) })
    robotPlacements.place('gamma', { x: Integer(2), y: Integer(0) })

    expect(robotPlacements.push('alpha', Direction.EAST)).toEqual([])
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 0, y: 0 })
    expect(robotPlacements.positionOf('beta')).toEqual({ x: 1, y: 0 })
    expect(robotPlacements.positionOf('gamma')).toEqual({ x: 2, y: 0 })
    expect(robotPlacements.occupantAt({ x: Integer(3), y: Integer(0) })).toBeUndefined()
  })

  it('moves into a pit without resolving its entry effect', () => {
    const board = createTestBoard([
      [new EmptyTile(), new PitTile(), new EmptyTile()],
    ], { ...antenna, x: Integer(2) }, { x: Integer(0), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(0), y: Integer(0) })

    expect(robotPlacements.push('alpha', Direction.EAST)).toEqual(['alpha'])
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 0 })
    expect(robotPlacements.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(robotPlacements.occupantAt({ x: Integer(1), y: Integer(0) })).toBe('alpha')
  })

  it('rejects invalid movement requests without changing state', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), antenna, rebootTile)
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(1), y: Integer(1) })

    expect(() => robotPlacements.push('unknown', Direction.NORTH)).toThrow()
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 1, y: 1 })
  })

  it('moves off the board without resolving the reboot', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 2), { ...antenna, y: Integer(1) }, { x: Integer(2), y: Integer(1) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(2), y: Integer(0) })

    expect(robotPlacements.push('alpha', Direction.EAST)).toEqual(['alpha'])
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 3, y: 0 })
    expect(robotPlacements.occupantAt({ x: Integer(2), y: Integer(0) })).toBeUndefined()
  })
})

describe('antenna obstacle', () => {
  it('rejects placement and relocation onto the antenna without changing occupancy', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), antenna, rebootTile)
    const robotPlacements = new RobotPlacements(board)
    const start = { x: Integer(1), y: Integer(1) }
    robotPlacements.place('alpha', start)

    expect(() => robotPlacements.place('beta', board.antenna)).toThrow(RangeError)
    expect(() => robotPlacements.relocate('alpha', board.antenna)).toThrow(RangeError)
    expect(() => robotPlacements.positionOf('beta')).toThrow()
    expect(robotPlacements.positionOf('alpha')).toEqual(start)
    expect(robotPlacements.occupantAt(board.antenna)).toBeUndefined()
  })

  it.each(steps)('blocks entry into the antenna when facing $opposite', ({ target, opposite }) => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), { ...antenna, x: Integer(1), y: Integer(1) }, { x: Integer(0), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', target)

    expect(robotPlacements.push('alpha', opposite)).toEqual([])
    expect(robotPlacements.positionOf('alpha')).toEqual(target)
    expect(robotPlacements.occupantAt(board.antenna)).toBeUndefined()
  })

  it('skips the antenna when finding a safe destination, including when it is the only tile', () => {
    const board = createTestBoard(createEmptyTileGrid(2, 1), antenna, { x: Integer(1), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    expect(robotPlacements.nearestFreePosition(board.antenna)).toEqual({ x: 1, y: 0 })
    robotPlacements.place('alpha', { x: Integer(1), y: Integer(0) })
    expect(robotPlacements.nearestFreePosition(board.antenna)).toBeUndefined()
  })
})

describe('reboot destinations', () => {
  it('prefers the requested tile, then distance, then top-to-bottom and left-to-right order', () => {
    const board = createTestBoard(createEmptyTileGrid(5, 5), antenna, { x: Integer(4), y: Integer(4) })
    const robotPlacements = new RobotPlacements(board)
    const origin = { x: Integer(2), y: Integer(2) }
    expect(robotPlacements.nearestFreePosition(origin)).toEqual(origin)
    robotPlacements.place('centre', origin)

    expect(robotPlacements.nearestFreePosition(origin)).toEqual({ x: 2, y: 1 })
    robotPlacements.place('north', { x: Integer(2), y: Integer(1) })
    expect(robotPlacements.nearestFreePosition(origin)).toEqual({ x: 1, y: 2 })
    robotPlacements.place('west', { x: Integer(1), y: Integer(2) })
    expect(robotPlacements.nearestFreePosition(origin)).toEqual({ x: 3, y: 2 })
    robotPlacements.place('east', { x: Integer(3), y: Integer(2) })
    expect(robotPlacements.nearestFreePosition(origin)).toEqual({ x: 2, y: 3 })
    expect(robotPlacements.positionOf('centre')).toEqual(origin)
  })

  it('skips pits and occupied tiles while allowing destinations enclosed by walls', () => {
    const tiles = createEmptyTileGrid(3, 3)
    tiles[0][1] = new PitTile()
    tiles[1][0] = new PitTile()
    tiles[2][1] = new EmptyTile([Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST])
    const board = createTestBoard(tiles, antenna, { x: Integer(2), y: Integer(2) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('centre', { x: Integer(1), y: Integer(1) })
    robotPlacements.place('east', { x: Integer(2), y: Integer(1) })

    expect(robotPlacements.nearestFreePosition({ x: Integer(1), y: Integer(1) })).toEqual({ x: Integer(1), y: Integer(2) })
  })

  it('returns no destination when every safe tile is occupied', () => {
    const board = createTestBoard([[new EmptyTile(), new PitTile(), new EmptyTile()]], { ...antenna, x: Integer(2) }, { x: Integer(0), y: Integer(0) })
    const robotPlacements = new RobotPlacements(board)
    robotPlacements.place('alpha', { x: Integer(0), y: Integer(0) })

    expect(robotPlacements.nearestFreePosition({ x: Integer(0), y: Integer(0) })).toBeUndefined()
    expect(robotPlacements.positionOf('alpha')).toEqual({ x: 0, y: 0 })
  })
})
