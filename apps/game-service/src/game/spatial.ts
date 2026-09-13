// Coordinates start at the top-left: x increases east, y increases south.
export type Position = Readonly<{ x: number; y: number }>

export enum Direction {
  NORTH = 'NORTH',
  EAST = 'EAST',
  SOUTH = 'SOUTH',
  WEST = 'WEST',
}

export function neighbour(position: Position, direction: Direction): Position {
  switch (direction) {
    case Direction.NORTH:
      return { x: position.x, y: position.y - 1 }
    case Direction.EAST:
      return { x: position.x + 1, y: position.y }
    case Direction.SOUTH:
      return { x: position.x, y: position.y + 1 }
    case Direction.WEST:
      return { x: position.x - 1, y: position.y }
  }
}

export function opposite(direction: Direction): Direction {
  switch (direction) {
    case Direction.NORTH:
      return Direction.SOUTH
    case Direction.EAST:
      return Direction.WEST
    case Direction.SOUTH:
      return Direction.NORTH
    case Direction.WEST:
      return Direction.EAST
  }
}
