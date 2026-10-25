import { describe, expect, it } from 'vitest'
import { Direction, Card, Robot } from '@/game/index'
import { UnsignedInteger } from '@/numbers'

describe('Robot', () => {
  it.each([
    [Direction.NORTH, Direction.WEST],
    [Direction.WEST, Direction.SOUTH],
    [Direction.SOUTH, Direction.EAST],
    [Direction.EAST, Direction.NORTH],
  ])('turns left from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start)
    robot.turn(1)
    expect(robot.direction).toBe(expected)
  })

  it.each([
    [Direction.NORTH, Direction.EAST], [Direction.EAST, Direction.SOUTH],
    [Direction.SOUTH, Direction.WEST], [Direction.WEST, Direction.NORTH],
  ])('turns right from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start)
    robot.turn(3)
    expect(robot.direction).toBe(expected)
  })

  it.each([
    [Direction.NORTH, Direction.SOUTH], [Direction.EAST, Direction.WEST],
    [Direction.SOUTH, Direction.NORTH], [Direction.WEST, Direction.EAST],
  ])('makes a U-turn from %s to %s', (start, expected) => {
    const robot = new Robot('robot-1', start)
    robot.turn(2)
    expect(robot.direction).toBe(expected)
  })

  it('returns to its starting direction after four left turns', () => {
    const robot = new Robot('robot-1', Direction.EAST)
    for (let turn = 0; turn < 4; turn++) robot.turn(1)
    expect(robot.direction).toBe(Direction.EAST)
  })

  it('retains an ordered five-card program independently of the input array', () => {
    const program = [
      new Card('move-1', 'MOVE_1'),
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-2', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('move-3', 'MOVE_1'),
    ]
    const robot = new Robot('robot-1', Direction.NORTH)
    robot.setProgram(program)
    program.reverse()

    expect(robot.id).toBe('robot-1')
    expect(robot.getProgramCard(UnsignedInteger(0))).toBe(program[4])
    expect(robot.getProgramCard(UnsignedInteger(1))).toBeInstanceOf(Card)
    expect(robot.getProgramCard(UnsignedInteger(4))).toBe(program[0])

    const exposedProgram = robot.program as Card[]
    exposedProgram.pop()
    expect(robot.program).toHaveLength(5)
  })

  it('rejects incomplete programs and invalid register reads', () => {
    const robot = new Robot('robot-1', Direction.NORTH)
    expect(() => robot.setProgram([new Card('only-card', 'MOVE_1')])).toThrow(RangeError)
    expect(() =>
      robot.setProgram(Array.from({ length: 6 }, (_, index) => new Card(`extra-${index}`, 'MOVE_1'))),
    ).toThrow(RangeError)
    expect(() => robot.getProgramCard(UnsignedInteger(0))).toThrow()

    robot.setProgram(Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1')))
    expect(() => robot.getProgramCard(UnsignedInteger(5))).toThrow(RangeError)
  })
})
