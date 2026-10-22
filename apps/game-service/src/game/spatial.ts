import { Integer } from '@/numbers'

// Coordinates start at the top-left: x increases east, y increases south.
export type Position = Readonly<{ x: Integer; y: Integer }>

export enum Direction {
  NORTH = 0,
  WEST = 1,
  SOUTH = 2,
  EAST = 3,
}

export function neighbour(position: Position, direction: Direction): Position {
  switch (direction) {
    case Direction.NORTH:
      return { x: position.x, y: Integer(position.y - 1) }
    case Direction.EAST:
      return { x: Integer(position.x + 1), y: position.y }
    case Direction.SOUTH:
      return { x: position.x, y: Integer(position.y + 1) }
    case Direction.WEST:
      return { x: Integer(position.x - 1), y: position.y }
  }
}

export function opposite(direction: Direction): Direction {
  return rotateDirection(direction, 2)
}

export function rotateDirection(direction: Direction, qTurns: number): Direction {
  return ((direction + qTurns) % 4) as Direction
}
