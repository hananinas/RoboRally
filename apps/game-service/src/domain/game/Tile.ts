import type { GearRotation } from '@robo-rally/game-events'
import type { Direction } from '@/domain/game/spatial'

export type TileKind = 'EMPTY' | 'PIT' | 'CONVEYOR' | 'GEAR' | 'REBOOT' | 'START'
export type TileEntryEffect = 'reboot'

// Tile suitability only; Board checks robot occupancy separately.
export function allowsPlacement(tile: Tile | undefined): boolean {
  return tile?.canOccupy === true
}

export abstract class Tile {
  abstract readonly kind: TileKind
  readonly canOccupy: boolean = true
  readonly entryEffect: TileEntryEffect | undefined = undefined
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
  override readonly canOccupy = false
  override readonly entryEffect = 'reboot'

  constructor(walls: Iterable<Direction> = []) {
    super(walls)
  }
}

export class ConveyorTile extends Tile {
  readonly kind = 'CONVEYOR'

  constructor(
    readonly sprite: string,
    readonly direction: Direction,
    walls: Iterable<Direction> = [],
    checkpointNumber?: number
  ) {
    super(walls, checkpointNumber)
  }
}

// Where robots begin. The number identifies the start position, not who spawns on it.
export class StartTile extends Tile {
  readonly kind = 'START'

  constructor(readonly number: number, walls: Iterable<Direction> = []) {
    super(walls)
  }
}

// Where robots reappear after falling; see Game.rebootRobot.
export class RebootTile extends Tile {
  readonly kind = 'REBOOT'

  constructor(walls: Iterable<Direction> = []) {
    super(walls)
  }
}

export class GearTile extends Tile {
  readonly kind = 'GEAR'

  constructor(readonly rotation: GearRotation, walls: Iterable<Direction> = []) {
    super(walls)
  }
}
