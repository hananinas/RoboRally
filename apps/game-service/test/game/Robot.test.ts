import { describe, expect, it } from 'vitest'
import { Direction, Move1, Robot, TurnLeft } from '@/game/index.js'

describe('Robot', () => {
  it.each([
    [Direction.NORTH, Direction.WEST],
    [Direction.WEST, Direction.SOUTH],
    [Direction.SOUTH, Direction.EAST],
    [Direction.EAST, Direction.NORTH],
  ])('turns left from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start)
    robot.turnLeft()
    expect(robot.direction).toBe(expected)
  })

    it.each([
    [Direction.NORTH, Direction.EAST], [Direction.EAST, Direction.SOUTH],
    [Direction.SOUTH, Direction.WEST], [Direction.WEST, Direction.NORTH],
  ])('turns right from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start)
    robot.turnRight()
    expect(robot.direction).toBe(expected)
  })

  it.each([
    [Direction.NORTH, Direction.SOUTH], [Direction.EAST, Direction.WEST],
    [Direction.SOUTH, Direction.NORTH], [Direction.WEST, Direction.EAST],
  ])('makes a U-turn from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start)
    robot.uTurn()
    expect(robot.direction).toBe(expected)
  })

  it('returns to its starting direction after four left turns', () => {
    const robot = new Robot('robot-1', Direction.EAST)
    for (let turn = 0; turn < 4; turn++) robot.turnLeft()
    expect(robot.direction).toBe(Direction.EAST)
  })

  it('retains an ordered five-card program independently of the input array', () => {
    const program = [
      new Move1('move-1'),
      new TurnLeft('left-1'),
      new Move1('move-2'),
      new TurnLeft('left-2'),
      new Move1('move-3'),
    ]
    const robot = new Robot('robot-1', Direction.NORTH)
    robot.setProgram(program)
    program.reverse()

    expect(robot.id).toBe('robot-1')
    expect(robot.getProgramCard(0)).toBe(program[4])
    expect(robot.getProgramCard(1)).toBeInstanceOf(TurnLeft)
    expect(robot.getProgramCard(4)).toBe(program[0])

    const exposedProgram = robot.program as (Move1 | TurnLeft)[]
    exposedProgram.pop()
    expect(robot.program).toHaveLength(5)
  })

  it('rejects incomplete programs and invalid register reads', () => {
    const robot = new Robot('robot-1', Direction.NORTH)
    expect(() => robot.setProgram([new Move1('only-card')])).toThrow(RangeError)
    expect(() =>
      robot.setProgram(Array.from({ length: 6 }, (_, index) => new Move1(`extra-${index}`))),
    ).toThrow(RangeError)
    expect(() => robot.getProgramCard(0)).toThrow()

    robot.setProgram(Array.from({ length: 5 }, (_, index) => new Move1(`move-${index}`)))
    for (const index of [-1, 5, 1.5]) {
      expect(() => robot.getProgramCard(index)).toThrow(RangeError)
    }
  })
})
