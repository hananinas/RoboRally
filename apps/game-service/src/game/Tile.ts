import type { Direction } from '@/game/spatial'

export abstract class Tile {
  private readonly wallDirections: Set<Direction>

  protected constructor(walls: Iterable<Direction> = [], private readonly checkpoint?: number) {
    if (checkpoint !== undefined && (!Number.isSafeInteger(checkpoint) || checkpoint < 1)) {
      throw new RangeError('Checkpoint number must be a positive integer')
    }
    this.wallDirections = new Set(walls)
  }

  get checkpointNumber(): number | undefined {
    return this.checkpoint
  }

  get walls(): ReadonlySet<Direction> {
    return new Set(this.wallDirections)
  }

  hasWall(direction: Direction): boolean {
    return this.wallDirections.has(direction)
  }
}

export class EmptyTile extends Tile {
  constructor(walls: Iterable<Direction> = [], checkpointNumber?: number) {
    super(walls, checkpointNumber)
  }
}
