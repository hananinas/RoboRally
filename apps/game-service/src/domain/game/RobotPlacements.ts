import type { Board } from '@/domain/game/Board'
import type { RobotId } from '@/domain/game/ids'
import { neighbour, type Direction, type Position } from '@/domain/game/spatial'
import { Integer } from '@/numbers'

export class RobotPlacements {
  readonly #board: Board
  readonly #positions = new Map<RobotId, Position>()

  constructor(board: Board) {
    this.#board = board
  }

  place(robotId: RobotId, position: Position): void {
    if (this.#board.getTile(position) === undefined) {
      throw new RangeError('Robot position must be on the board')
    }
    this.#requirePlaceable(position)
    if (this.#positions.has(robotId)) {
      throw new Error(`Robot ${robotId} is already on the board`)
    }
    if (this.occupantAt(position) !== undefined) {
      throw new Error('Tile is already occupied')
    }

    this.#moveTo(robotId, position)
  }

  relocate(robotId: RobotId, position: Position): void {
    if (!this.#positions.has(robotId)) {
      throw new Error(`Robot ${robotId} is not on the board`)
    }
    this.#requirePlaceable(position)
    const occupant = this.occupantAt(position)
    if (occupant !== undefined && occupant !== robotId) {
      throw new Error('Tile is already occupied')
    }
    this.#moveTo(robotId, position)
  }

  remove(robotId: RobotId): void {
    this.#positions.delete(robotId)
  }

  positionOf(robotId: RobotId): Position {
    const position = this.#positions.get(robotId)
    if (!position) {
      throw new Error(`Robot ${robotId} is not on the board`)
    }
    return { ...position }
  }

  occupantAt(position: Position): RobotId | undefined {
    for (const [robotId, occupiedPosition] of this.#positions) {
      if (occupiedPosition.x === position.x && occupiedPosition.y === position.y) {
        return robotId
      }
    }
    return undefined
  }

  nearestFreePosition(origin: Position): Position | undefined {
    const occupied = new Set([...this.#positions.values()].map((position) => this.#keyOf(position)))
    let nearest: Position | undefined
    let nearestDistance = Infinity
    for (let y = 0; y < this.#board.height; y++) {
      for (let x = 0; x < this.#board.width; x++) {
        const position = { x: Integer(x), y: Integer(y) }
        if (!this.#board.allowsPlacement(position) || occupied.has(this.#keyOf(position))) continue
        const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y)
        if (distance < nearestDistance) {
          nearest = position
          nearestDistance = distance
        }
      }
    }
    return nearest
  }

  // One atomic step. Return displaced robots farthest first for entry effects.
  push(robotId: RobotId, direction: Direction): readonly RobotId[] {
    const chain = [robotId]
    let position = this.positionOf(robotId)
    while (true) {
      if (this.#board.blocksMovementFrom(position, direction)) return []
      const nextPosition = neighbour(position, direction)
      const occupant = this.occupantAt(nextPosition)
      if (occupant === undefined) break
      chain.push(occupant)
      position = nextPosition
    }

    chain.reverse()
    for (const id of chain) {
      this.#moveTo(id, neighbour(this.positionOf(id), direction))
    }
    return chain
  }

  #requirePlaceable(position: Position): void {
    if (!this.#board.allowsPlacement(position)) {
      throw new RangeError('Robots cannot be placed on pits or the priority antenna')
    }
  }

  #moveTo(robotId: RobotId, position: Position): void {
    this.#positions.set(robotId, { ...position })
  }

  #keyOf(position: Position): string {
    return `${position.x},${position.y}`
  }
}
