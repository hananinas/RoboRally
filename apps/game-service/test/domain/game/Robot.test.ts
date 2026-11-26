import { describe, expect, it } from 'vitest'
import { Direction, Robot } from '@/domain/game/index'

describe('Robot', () => {
  it.each([
    [Direction.NORTH, Direction.WEST],
    [Direction.WEST, Direction.SOUTH],
    [Direction.SOUTH, Direction.EAST],
    [Direction.EAST, Direction.NORTH],
  ])('turns left from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start, 'red', 'tank')
    robot.turn(1)
    expect(robot.direction).toBe(expected)
  })

  it.each([
    [Direction.NORTH, Direction.EAST], [Direction.EAST, Direction.SOUTH],
    [Direction.SOUTH, Direction.WEST], [Direction.WEST, Direction.NORTH],
  ])('turns right from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start, 'red', 'tank')
    robot.turn(3)
    expect(robot.direction).toBe(expected)
  })

  it.each([
    [Direction.NORTH, Direction.SOUTH], [Direction.EAST, Direction.WEST],
    [Direction.SOUTH, Direction.NORTH], [Direction.WEST, Direction.EAST],
  ])('makes a U-turn from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start, 'red', 'tank')
    robot.turn(2)
    expect(robot.direction).toBe(expected)
  })

  it('returns to its starting direction after four left turns', () => {
    const robot = new Robot('robot-1', Direction.EAST, 'red', 'tank')
    for (let turn = 0; turn < 4; turn++) robot.turn(1)
    expect(robot.direction).toBe(Direction.EAST)
  })

  it('keeps its id', () => {
    expect(new Robot('robot-1', Direction.NORTH, 'red', 'tank').id).toBe('robot-1')
  })
})
