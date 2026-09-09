import { Tile } from './Tile.js'
import type { TileWalls } from './Tile.js'

export type Position = Readonly<{ x: number; y: number }>

// Coordinates start at the top-left; x increases east and y increases south.
export class Board {
  private readonly matrix: readonly (readonly Tile[])[]
  readonly width: number
  readonly height: number

  constructor(matrix: readonly (readonly Tile[])[]) {
    const width = matrix[0]?.length ?? 0
    if (width === 0 || matrix.some((row) => row.length !== width)) {
      throw new RangeError('A board must be a non-empty rectangular tile grid')
    }

    this.width = width
    this.height = matrix.length
    this.matrix = Object.freeze(matrix.map((row) => Object.freeze([...row])))
  }

  contains(position: Position): boolean {
    return (
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      position.x >= 0 &&
      position.x < this.width &&
      position.y >= 0 &&
      position.y < this.height
    )
  }

  getTile(position: Position): Tile | undefined {
    return this.contains(position) ? this.matrix[position.y][position.x] : undefined
  }

  // Checks a single orthogonal step, independent of robot orientation or state.
  // Leaving the grid is rejected here; falling/reboot rules are outside v0.
  canMove(from: Position, to: Position): boolean {
    const source = this.getTile(from)
    const destination = this.getTile(to)
    if (!source || !destination) return false

    const dx = to.x - from.x
    const dy = to.y - from.y
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false

    let exit: keyof TileWalls
    let entrance: keyof TileWalls
    if (dx === 1) {
      exit = 'east'
      entrance = 'west'
    } else if (dx === -1) {
      exit = 'west'
      entrance = 'east'
    } else if (dy === 1) {
      exit = 'south'
      entrance = 'north'
    } else {
      exit = 'north'
      entrance = 'south'
    }

    return !source.walls[exit] && !destination.walls[entrance]
  }
}
