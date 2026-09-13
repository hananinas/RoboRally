import type { Direction } from './spatial.js'

export abstract class Tile {
  private readonly wallDirections: Set<Direction>

  protected constructor(walls: Iterable<Direction> = []) {
    this.wallDirections = new Set(walls)
  }

  get walls(): ReadonlySet<Direction> {
    return new Set(this.wallDirections)
  }

  hasWall(direction: Direction): boolean {
    return this.wallDirections.has(direction)
  }
}

export class EmptyTile extends Tile {
  constructor(walls: Iterable<Direction> = []) {
    super(walls)
  }
}
