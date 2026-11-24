import { type Direction, type Position, neighbour, opposite } from '@/domain/game/spatial'
import { allowsPlacement, type Tile } from '@/domain/game/Tile'
import { Integer } from '@/numbers'

export type Antenna = Readonly<Position & { angle: number }>

export class Board {
  private readonly tiles: readonly (readonly Tile[])[]
  private readonly checkpointTotal: number
  readonly width: number
  readonly height: number
  readonly antenna: Antenna
  readonly rebootTiles: readonly Position[]
  readonly startTiles: readonly Position[]

  constructor(
    tiles: readonly (readonly Tile[])[],
    antenna: Antenna,
    startTiles: readonly Position[],
  ) {
    const width = tiles[0]?.length ?? 0
    if (width === 0 || tiles.some((row) => row.length !== width)) {
      throw new RangeError('A board must be a non-empty rectangular tile grid')
    }

    const checkpoints = tiles.flat().map((tile) => tile.checkpointNumber)
      .filter((number) => number !== undefined)
    if (new Set(checkpoints).size !== checkpoints.length ||
        checkpoints.some((number) => number > checkpoints.length)) {
      throw new RangeError('Checkpoint numbers must be unique and consecutive from 1')
    }

    this.checkpointTotal = checkpoints.length
    this.width = width
    this.height = tiles.length
    this.tiles = tiles.map((row) => [...row])

    if (!this.contains(antenna) || !Number.isFinite(antenna.angle)) {
      throw new RangeError('The antenna must be on the board with a finite angle')
    }
    this.antenna = Object.freeze({ ...antenna })

    // Reboot tiles in reading order: top-to-bottom, then left-to-right.
    const rebootTiles = this.tiles.flatMap((row, y) => row.flatMap((tile, x) =>
      tile.kind === 'REBOOT' ? [{ x: Integer(x), y: Integer(y) }] : []))
    if (rebootTiles.length === 0) {
      throw new RangeError('A board requires at least one reboot tile')
    }
    if (!rebootTiles.every((position) => this.allowsPlacement(position))) {
      throw new RangeError('Reboot tiles must be outside the priority antenna')
    }
    this.rebootTiles = Object.freeze(rebootTiles.map((position) => Object.freeze(position)))

    if (startTiles.length === 0) {
      throw new RangeError('A board must have at least one starting tile')
    }
    const startKeys = new Set(startTiles.map(({ x, y }) => `${x},${y}`))
    if (startKeys.size !== startTiles.length) {
      throw new RangeError('Starting tiles must be distinct')
    }
    if (!startTiles.every((position) => this.allowsPlacement(position))) {
      throw new RangeError('Starting tiles must be non-pit tiles on the board outside the priority antenna')
    }
    this.startTiles = Object.freeze(startTiles.map((position) => Object.freeze({ ...position })))
  }

  get checkpointCount(): number {
    return this.checkpointTotal
  }

  private contains(position: Position): boolean {
    return (
      position.x >= 0 &&
      position.x < this.width &&
      position.y >= 0 &&
      position.y < this.height
    )
  }

  getTile(position: Position): Tile | undefined {
    return this.contains(position) ? this.tiles[position.y][position.x] : undefined
  }

  // Tile and obstacle suitability; robot occupancy is checked separately.
  allowsPlacement(position: Position): boolean {
    return allowsPlacement(this.getTile(position)) && !this.isAntenna(position)
  }

  private isAntenna(position: Position): boolean {
    return position.x === this.antenna.x && position.y === this.antenna.y
  }

  blocksMovementFrom(position: Position, direction: Direction): boolean {
    const nextPosition = neighbour(position, direction)
    return this.getTile(position)?.hasWall(direction) === true ||
      this.getTile(nextPosition)?.hasWall(opposite(direction)) === true ||
      this.isAntenna(nextPosition)
  }
}
