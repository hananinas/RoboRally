import { resolveRobotAction } from '../../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card, Direction, EmptyTile, type Position } from '@/domain/game/index'
import { Deck } from '@/domain/game/Deck'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestBoard, createTestGame, createTestPlacement, instructionsOf } from '../../fixtures.ts'

function createGame(
  instruction: Instruction = 'MOVE_3',
  start: Position = { x: Integer(3), y: Integer(2) },
  walls: readonly Direction[] = [],
) {
  const tiles = createEmptyTileGrid(5, 5)
  tiles[start.y][start.x] = new EmptyTile(walls)
  tiles[1][1] = new EmptyTile([], 1)
  tiles[4][0] = new EmptyTile([], 2)
  const reboot = { x: Integer(1), y: Integer(2) }
  const board = createTestBoard(tiles, { x: Integer(0), y: Integer(0), angle: 0 }, reboot, [start])
  const direction = instruction === 'BACK_UP' ? Direction.WEST : Direction.EAST
  const instructions: Instruction[] = [instruction, 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'MOVE_1']
  const program = instructions.map((instr, index) => new Card(`card-${index}`, instr))
  const placement = createTestPlacement(start, { direction, deck: new Deck(program) })
  const { player } = placement
  const robot = player.robot
  const game = createTestGame({ board, players: [placement], deck: instructionsOf(program) })
  return { robot, player, program, reboot, game }
}

const edges = [
  { direction: Direction.NORTH, start: { x: Integer(2), y: Integer(0) } },
  { direction: Direction.EAST, start: { x: Integer(4), y: Integer(2) } },
  { direction: Direction.SOUTH, start: { x: Integer(2), y: Integer(4) } },
  { direction: Direction.WEST, start: { x: Integer(0), y: Integer(2) } },
]

describe('board-edge falls', () => {
  it.each(edges)('reboots immediately after falling off the $direction edge', ({ direction, start }) => {
    const { robot, player, program, reboot, game } = createGame('MOVE_3', start)
    robot.turn([Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH].indexOf(direction))
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    expect(result.action.position).toEqual(reboot)
    expect(game.getRobotPosition(robot.id)).toEqual(reboot)
    expect(player.registers.slots).toEqual(program)
    expect(player.hand).toEqual([])
    expect(game.currentRegister).toBe(1)
  })

  it.each(edges)('does not fall through a wall on the $direction edge', ({ direction, start }) => {
    const { robot, player, program, game } = createGame('MOVE_3', start, [direction])
    robot.turn([Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH].indexOf(direction))
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    resolveRobotAction(game)

    expect(game.getRobotPosition(robot.id)).toEqual(start)
  })

  it.each([
    { instruction: 'MOVE_1', x: 4 },
    { instruction: 'MOVE_2', x: 3 },
    { instruction: 'MOVE_2', x: 4 },
    { instruction: 'MOVE_3', x: 2 },
    { instruction: 'MOVE_3', x: 3 },
    { instruction: 'MOVE_3', x: 4 },
    { instruction: 'BACK_UP', x: 4 },
  ] as const)('reboots during $instruction from column $x and discards remaining steps', ({ instruction, x }) => {
    const start = { x: Integer(x), y: Integer(2) }
    const { robot, player, program, reboot, game } = createGame(instruction, start)
    const direction = robot.direction
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    expect(result).toMatchObject({
      registerIndex: 0,
      pushedRobots: [],
      action: { robotId: robot.id, card: program[0], position: reboot, direction },
    })
    expect(game.getRobotPosition(robot.id)).toEqual(reboot)
    expect(robot.direction).toBe(direction)
    expect(player.registers.slots).toEqual(program)
    expect(player.hand).toEqual([])
    expect(player.lastCheckpoint).toBe(0)
    expect(game.currentRegister).toBe(1)
    expect(game.lastActivePhase).toBe('activation')

    expect(resolveRobotAction(game).action.card).toBe(program[1])
    expect(game.getRobotPosition(robot.id)).toEqual(reboot)
    expect(player.registers.slots).toEqual(program)
    expect(game.currentRegister).toBe(2)
  })

  it('can reboot onto the only safe square after vacating it', () => {
    const reboot = { x: Integer(0), y: Integer(0) }
    const board = createTestBoard([[new EmptyTile(), new EmptyTile()]], { x: Integer(1), y: Integer(0), angle: 0 }, reboot)
    const program = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'MOVE_3'))
    const placement = createTestPlacement(reboot, { direction: Direction.WEST, deck: new Deck(program) })
    const { player } = placement
    const robot = player.robot
    const game = createTestGame({ board, players: [placement], deck: instructionsOf(program) })
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    for (let register = 0; register < 5; register++) {
      expect(resolveRobotAction(game).action.position).toEqual(reboot)
      expect(game.getRobotPosition(robot.id)).toEqual(reboot)
      expect(robot.direction).toBe(Direction.WEST)
    }
    expect(game.lastActivePhase).toBe('programming')
  })
})
