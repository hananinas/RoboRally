import type { Direction } from '@/game/spatial'

export type TileKind = 'EMPTY' | 'PIT'
export type TileEntryEffect = 'reboot'

export type TileDefinition = Readonly<{
  canOccupy: boolean
  entryEffect?: TileEntryEffect
}>

// Placement/reboot suitability does not restrict movement into an entry-effect tile.
export const tileDefinitions: Readonly<Record<TileKind, TileDefinition>> = {
  EMPTY: { canOccupy: true },
  PIT: { canOccupy: false, entryEffect: 'reboot' },
}

export abstract class Tile {
  abstract readonly kind: TileKind
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
  readonly kind = 'EMPTY'

  constructor(walls: Iterable<Direction> = [], checkpointNumber?: number) {
    super(walls, checkpointNumber)
  }
}

export class PitTile extends Tile {
  readonly kind = 'PIT'

  constructor(walls: Iterable<Direction> = []) {
    super(walls)
  }
}
