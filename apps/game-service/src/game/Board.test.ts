import { describe, expect, it } from 'vitest'
import { Board, Tile } from './index.js'
import type { Position, TileWalls } from './index.js'

function createGrid(width = 3, height = 3): Tile[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => new Tile()),
  )
}

const directions: {
  name: string
  to: Position
  exit: keyof TileWalls
  entrance: keyof TileWalls
}[] = [
  { name: 'north', to: { x: 1, y: 0 }, exit: 'north', entrance: 'south' },
  { name: 'east', to: { x: 2, y: 1 }, exit: 'east', entrance: 'west' },
  { name: 'south', to: { x: 1, y: 2 }, exit: 'south', entrance: 'north' },
  { name: 'west', to: { x: 0, y: 1 }, exit: 'west', entrance: 'east' },
]

describe('Board', () => {
  it('stores a rectangular grid using row-major coordinates', () => {
    const grid = createGrid(3, 2)
    const board = new Board(grid)

    expect(board.width).toBe(3)
    expect(board.height).toBe(2)
    expect(board.getTile({ x: 2, y: 1 })).toBe(grid[1][2])
    expect(board.contains({ x: 0, y: 0 })).toBe(true)
    expect(board.contains({ x: 2, y: 1 })).toBe(true)
  })

  it.each([
    { matrix: [] },
    { matrix: [[]] },
    { matrix: [[new Tile()], []] },
    { matrix: [[new Tile()], [new Tile(), new Tile()]] },
  ])(
    'rejects an empty or ragged grid (%#)',
    ({ matrix }) => {
      expect(() => new Board(matrix)).toThrow(RangeError)
    },
  )

  it('supports a single tile without allowing movement beyond it', () => {
    const board = new Board([[new Tile()]])
    expect(board.contains({ x: 0, y: 0 })).toBe(true)
    for (const to of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
      expect(board.canMove({ x: 0, y: 0 }, to)).toBe(false)
    }
  })

  it.each([
    { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 3, y: 0 }, { x: 0, y: 3 },
    { x: 0.5, y: 0 }, { x: 0, y: 0.5 }, { x: NaN, y: 0 }, { x: 0, y: Infinity },
  ])('rejects invalid coordinates $x, $y', (position) => {
    const board = new Board(createGrid())
    expect(board.contains(position)).toBe(false)
    expect(board.getTile(position)).toBeUndefined()
    expect(board.canMove(position, { x: 0, y: 0 })).toBe(false)
    expect(board.canMove({ x: 0, y: 0 }, position)).toBe(false)
  })

  it('copies the grid so callers cannot replace or remove board tiles', () => {
    const grid = createGrid(2, 2)
    const original = grid[0][0]
    const board = new Board(grid)
    grid[0][0] = new Tile({ east: true })
    grid[1].pop()
    grid.pop()

    expect(board.getTile({ x: 0, y: 0 })).toBe(original)
    expect(board.getTile({ x: 1, y: 1 })).toBeInstanceOf(Tile)
    expect(board.width).toBe(2)
    expect(board.height).toBe(2)
  })

  it.each(directions)('allows an unobstructed step $name', ({ to }) => {
    const board = new Board(createGrid())
    expect(board.canMove({ x: 1, y: 1 }, to)).toBe(true)
  })

  it.each(directions)('blocks a source wall to the $name in both directions', ({ to, exit }) => {
    const grid = createGrid()
    grid[1][1] = new Tile({ [exit]: true })
    const board = new Board(grid)
    expect(board.canMove({ x: 1, y: 1 }, to)).toBe(false)
    expect(board.canMove(to, { x: 1, y: 1 })).toBe(false)
  })

  it.each(directions)('blocks a destination wall to the $name', ({ to, entrance }) => {
    const grid = createGrid()
    grid[to.y][to.x] = new Tile({ [entrance]: true })
    const board = new Board(grid)
    expect(board.canMove({ x: 1, y: 1 }, to)).toBe(false)
  })

  it('does not block movement along unrelated walls', () => {
    const board = new Board([[
      new Tile({ north: true, south: true, west: true }),
      new Tile({ north: true, south: true, east: true }),
    ]])
    expect(board.canMove({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true)
    expect(board.canMove({ x: 1, y: 0 }, { x: 0, y: 0 })).toBe(true)
  })

  it.each([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 0 }])(
    'rejects stationary or diagonal moves to $x, $y', (to) => {
      expect(new Board(createGrid()).canMove({ x: 1, y: 1 }, to)).toBe(false)
    },
  )

  it('rejects multi-tile jumps', () => {
    const board = new Board(createGrid())
    expect(board.canMove({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false)
    expect(board.canMove({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe(false)
  })
})

describe('Tile', () => {
  it('has no walls by default', () => {
    expect(new Tile().walls).toEqual({ north: false, east: false, south: false, west: false })
  })

  it('copies and freezes its wall configuration', () => {
    const walls = { north: true, west: true }
    const tile = new Tile(walls)
    walls.north = false
    expect(tile.walls).toEqual({ north: true, east: false, south: false, west: true })
    expect(Object.isFrozen(tile.walls)).toBe(true)
  })
})
