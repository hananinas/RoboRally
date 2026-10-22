import { type Direction, type Position, neighbour, opposite } from '@/game/spatial'
import type { RobotId } from '@/game/ids'
import { PitTile, type Tile } from '@/game/Tile'
import { Integer, type PositiveInteger } from '@/numbers'

export type MovementResult = Readonly<{
  position: Position
  stepsMoved: number
  blocked: boolean
}>

export type Antenna = Readonly<Position & { angle: number }>

export type BoardMap = Readonly<{
  name: string
  icon: string
  maxPlayers: number
}>

export class Board {
  private readonly tiles: readonly (readonly Tile[])[]
  private readonly robotPositions = new Map<RobotId, Position>()
  private readonly checkpointTotal: number
  readonly width: number
  readonly height: number
  readonly antenna: Antenna
  readonly map?: BoardMap

  constructor(tiles: readonly (readonly Tile[])[], antenna: Antenna, map?: BoardMap) {
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
    this.map = map === undefined ? undefined : Object.freeze({ ...map })
  }

  get checkpointCount(): number {
    return this.checkpointTotal
  }

  get hasPits(): boolean {
    return this.tiles.some((row) => row.some((tile) => tile instanceof PitTile))
  }

  contains(position: Position): boolean {
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

  placeRobot(robotId: RobotId, position: Position): void {
    if (!this.contains(position)) {
      throw new RangeError('Robot position must be on the board')
    }
    if (this.getTile(position) instanceof PitTile) {
      throw new RangeError('Robots cannot be placed on pits')
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
    if (!this.contains(position) || this.getTile(position) instanceof PitTile) {
      throw new RangeError('Robot destination must be a non-pit tile on the board')
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
        if (this.tiles[y][x] instanceof PitTile || this.occupantAt(position) !== undefined) continue
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

  moveRobot(robotId: RobotId, direction: Direction, steps: PositiveInteger): MovementResult {
    // Verify robot is on the board
    let currentPosition = this.positionOf(robotId)
    let nextPosition: Position = currentPosition
    let stepsMoved = 0
    
    for (let step = 0; step < steps; step++) {
      currentPosition = nextPosition
      nextPosition = neighbour(nextPosition, direction)

      if (this.getTile(currentPosition)?.hasWall(direction)) {
        // robot is blocked by a wall in the current tile
        return { position: currentPosition, stepsMoved: step, blocked: true }
      }

      if (this.getTile(nextPosition)?.hasWall(opposite(direction))) {
        // robot blocked by a wall in the next tile
        return { position: currentPosition, stepsMoved: step, blocked: true }
      }

      if (!this.contains(nextPosition)) {
        // robot hits board edge
        return { position: currentPosition, stepsMoved: step, blocked: true }
      }
      
      if (this.occupantAt(nextPosition) !== undefined) {
        // robot is blocked by another robot
        return { position: currentPosition, stepsMoved: step, blocked: true }
      }

      // move the robot to the next position as it is free
      this.updateRobotPosition(robotId, nextPosition)
      stepsMoved = step + 1
      if (this.getTile(nextPosition) instanceof PitTile) break
    }

    return { position: this.positionOf(robotId), stepsMoved: stepsMoved, blocked: false }
  }
}
