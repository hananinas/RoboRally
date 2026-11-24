import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, PitTile, RebootTile, StartTile } from '@/domain/game/index.ts'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestBoard, gridWithRebootTiles } from '../../fixtures.ts'

const antenna = { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }
const rebootTile = { x: Integer(2), y: Integer(2) }

describe('Tile and Board layout', () => {
  it('orders its starting tiles by number and rejects one on the antenna', () => {
    const at = (x: number, y: number) => ({ x: Integer(x), y: Integer(y) })
    const grid = gridWithRebootTiles(createEmptyTileGrid(3, 3), at(0, 1))

    // Declared out of number order and scanned in reading order, so neither ordering
    // would produce this result by accident.
    grid[1][2] = new StartTile(1)
    grid[1][1] = new StartTile(2)
    expect(new Board(grid, antenna).startTiles).toEqual([at(2, 1), at(1, 1)])

    grid[antenna.y][antenna.x] = new StartTile(3)
    expect(() => new Board(grid, antenna)).toThrow(RangeError)
  })

  it('stores pits with walls without counting them as checkpoints', () => {
    const pit = new PitTile([Direction.NORTH])
    const board = createTestBoard([
      [pit, new EmptyTile([], 1), new PitTile()],
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], antenna, { x: Integer(0), y: Integer(1) })

    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(pit)
    expect(pit.hasWall(Direction.NORTH)).toBe(true)
    expect(pit.checkpointNumber).toBeUndefined()
    expect(board.checkpointCount).toBe(1)
  })

  it('stores checkpoint state alongside walls and derives the total from the grid', () => {
    const checkpoint = new EmptyTile([Direction.NORTH], 2)
    const first = new EmptyTile([], 1)
    const empty = new EmptyTile()
    const board = createTestBoard([[checkpoint, empty, first]], antenna, { x: Integer(1), y: Integer(0) })

    expect(checkpoint.checkpointNumber).toBe(2)
    expect(checkpoint.hasWall(Direction.NORTH)).toBe(true)
    expect(empty.checkpointNumber).toBeUndefined()
    expect(board.checkpointCount).toBe(2)
    expect(createTestBoard([[new EmptyTile(), new EmptyTile()]], antenna, { x: Integer(1), y: Integer(0) }).checkpointCount).toBe(0)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(checkpoint)
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid checkpoint number %s',
    (number) => expect(() => new EmptyTile([], number)).toThrow(RangeError),
  )

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

    const tiles = createEmptyTileGrid(2, 2)
    const original = tiles[0][0]
    const board = createTestBoard(tiles, antenna, { x: Integer(1), y: Integer(0) })
    tiles[0][0] = new EmptyTile([Direction.EAST])
    tiles.pop()

    expect(board.width).toBe(2)
    expect(board.height).toBe(2)
    expect(board.getTile({ x: Integer(0), y: Integer(0) })).toBe(original)
    expect(board.getTile({ x: Integer(1), y: Integer(1) })).toBeInstanceOf(EmptyTile)
  })

  it('keeps an independent, frozen copy of its antenna', () => {
    const source = { x: Integer(1), y: Integer(2), angle: Math.PI / 2 }
    const board = createTestBoard(createEmptyTileGrid(3, 3), source, { x: Integer(0), y: Integer(0) })
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
      expect(() => createTestBoard(createEmptyTileGrid(3, 3), invalid, rebootTile)).toThrow(RangeError)
    }
  })

  it('lists its reboot tiles in reading order and freezes them', () => {
    const at = (x: number, y: number) => ({ x: Integer(x), y: Integer(y) })
    const tiles = createEmptyTileGrid(3, 3)
    tiles[1][1] = new RebootTile([Direction.NORTH])
    const board = createTestBoard(tiles, antenna, [at(2, 2), at(0, 1)])

    expect(board.rebootTiles).toEqual([at(0, 1), at(1, 1), at(2, 2)])
    expect(board.getTile(at(1, 1))).toMatchObject({ kind: 'REBOOT' })
    expect(board.getTile(at(1, 1))?.hasWall(Direction.NORTH)).toBe(true)
    expect(Object.isFrozen(board.rebootTiles)).toBe(true)
    expect(() => Object.assign(board.rebootTiles[0], { x: 2 })).toThrow()
  })

  it('requires a reboot tile outside the antenna', () => {
    const boardAntenna = { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }
    expect(() => new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], boardAntenna)).toThrow(RangeError)
    expect(() => new Board([[new EmptyTile(), new PitTile(), new RebootTile()]], boardAntenna)).toThrow(RangeError)
    expect(new Board([[new RebootTile(), new PitTile(), new EmptyTile()]], boardAntenna).rebootTiles)
      .toEqual([{ x: 0, y: 0 }])
  })

  it('allows placement on reboot tiles without an entry effect', () => {
    const board = new Board(
      [[new EmptyTile(), new RebootTile(), new EmptyTile()]],
      { x: Integer(2), y: Integer(0), angle: 0 },
    )

    expect(board.allowsPlacement({ x: Integer(1), y: Integer(0) })).toBe(true)
    expect(board.getTile({ x: Integer(1), y: Integer(0) })?.entryEffect).toBeUndefined()
  })

  it('rejects positions outside the grid or between tiles', () => {
    const board = createTestBoard(createEmptyTileGrid(3, 3), antenna, rebootTile)
    for (const position of [
      { x: Integer(-1), y: Integer(0) },
      { x: Integer(3), y: Integer(0) },
      { x: Integer(0), y: Integer(3) },
    ]) {
      expect(board.getTile(position)).toBeUndefined()
    }
  })
})
