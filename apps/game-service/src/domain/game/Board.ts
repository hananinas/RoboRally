import { type Direction, type Position, neighbour, opposite } from '@/domain/game/spatial'
import type { RobotId } from '@/domain/game/ids'
import { allowsPlacement, type Tile } from '@/domain/game/Tile'
import { Integer } from '@/numbers'

export type Antenna = Readonly<Position & { angle: number }>

export class Board {
  private readonly tiles: readonly (readonly Tile[])[]
  private readonly robotPositions = new Map<RobotId, Position>()
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

  placeRobot(robotId: RobotId, position: Position): void {
    const tile = this.getTile(position)
    if (tile === undefined) {
      throw new RangeError('Robot position must be on the board')
    }
    if (!this.allowsPlacement(position)) {
      throw new RangeError('Robots cannot be placed on pits or the priority antenna')
    }
    if (this.robotPositions.has(robotId)) {
      throw new Error(`Robot ${robotId} is already on the board`)
    }
    if (this.occupantAt(position) !== undefined) {
      throw new Error('Tile is already occupied')
    }

    this.robotPositions.set(robotId, { ...position })
  }

  relocateRobot(robotId: RobotId, position: Position): void {
    this.positionOf(robotId)
    if (!this.allowsPlacement(position)) {
      throw new RangeError('Robot destination must be a non-pit tile on the board outside the priority antenna')
    }
    const occupant = this.occupantAt(position)
    if (occupant !== undefined && occupant !== robotId) {
      throw new Error('Tile is already occupied')
    }
    this.updateRobotPosition(robotId, position)
  }

  nearestFreePosition(origin: Position): Position | undefined {
    let nearest: Position | undefined
    let nearestDistance = Infinity
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const position = { x: Integer(x), y: Integer(y) }
        if (!this.allowsPlacement(position) || this.occupantAt(position) !== undefined) continue
        const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y)
        if (distance < nearestDistance) {
          nearest = position
          nearestDistance = distance
        }
      }
    }
    return nearest
  }

  positionOf(robotId: RobotId): Position {
    const position = this.robotPositions.get(robotId)
    if (!position) {
      throw new Error(`Robot ${robotId} is not on the board`)
    }
    return { ...position }
  }

  removeRobot(robotId: RobotId): void {
    this.robotPositions.delete(robotId)
  }

  occupantAt(position: Position): RobotId | undefined {
    for (const [robotId, occupiedPosition] of this.robotPositions) {
      if (occupiedPosition.x === position.x && occupiedPosition.y === position.y) {
        return robotId
      }
    }
    return undefined
  }

  private updateRobotPosition(robotId: RobotId, position: Position): void {
    this.robotPositions.set(robotId, { ...position })
  }

  private blocksMovement(position: Position, direction: Direction): boolean {
    const nextPosition = neighbour(position, direction)
    return this.getTile(position)?.hasWall(direction) === true ||
      this.getTile(nextPosition)?.hasWall(opposite(direction)) === true ||
      this.isAntenna(nextPosition)
  }

  // One atomic step. Return displaced robots farthest first for entry effects.
  pushRobot(robotId: RobotId, direction: Direction): readonly RobotId[] {
    const chain = [robotId]
    let position = this.positionOf(robotId)
    while (true) {
      if (this.blocksMovement(position, direction)) return []
      const nextPosition = neighbour(position, direction)
      const occupant = this.occupantAt(nextPosition)
      if (occupant === undefined) break
      chain.push(occupant)
      position = nextPosition
    }

    chain.reverse()
    for (const id of chain) {
      this.updateRobotPosition(id, neighbour(this.positionOf(id), direction))
    }
    return chain
  }
}
