import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Board, Card, Direction, EmptyTile, type Position } from '@/game/index'
import { Deck } from '@/game/Deck'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestGame, placeTestPlayer } from '../fixtures.ts'

function createGame(
  instruction: Instruction = 'MOVE_3',
  start: Position = { x: Integer(3), y: Integer(2) },
  walls: readonly Direction[] = [],
) {
  const tiles = createEmptyTileGrid(5, 5)
  tiles[start.y][start.x] = new EmptyTile(walls)
  tiles[2][1] = new EmptyTile([], 1)
  tiles[4][0] = new EmptyTile([], 2)
  const reboot = { x: Integer(1), y: Integer(2) }
  const board = new Board(tiles, { x: Integer(0), y: Integer(0), angle: 0 }, reboot)
  const direction = instruction === 'BACK_UP' ? Direction.WEST : Direction.EAST
  const instructions: Instruction[] = [instruction, 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'MOVE_1']
  const program = instructions.map((instr, index) => new Card(`card-${index}`, instr))
  const player = placeTestPlayer(board, start, { direction, deck: new Deck(program) })
  const robot = player.robot
  const game = createTestGame({ board, players: [player], deck: program })
  return { board, robot, player, program, reboot, game }
}

const edges = [
  { direction: Direction.NORTH, start: { x: Integer(2), y: Integer(0) }, outside: { x: Integer(2), y: Integer(-1) } },
  { direction: Direction.EAST, start: { x: Integer(4), y: Integer(2) }, outside: { x: Integer(5), y: Integer(2) } },
  { direction: Direction.SOUTH, start: { x: Integer(2), y: Integer(4) }, outside: { x: Integer(2), y: Integer(5) } },
  { direction: Direction.WEST, start: { x: Integer(0), y: Integer(2) }, outside: { x: Integer(-1), y: Integer(2) } },
]

describe('board-edge falls', () => {
  it.each(edges)('reboots immediately after falling off the $direction edge', ({ direction, start, outside }) => {
    const { board, robot, player, program, reboot, game } = createGame('MOVE_3', start)
    robot.turn([Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH].indexOf(direction))
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()

    expect(result.action.position).toEqual(reboot)
    expect(board.positionOf(robot.id)).toEqual(reboot)
    expect(board.occupantAt(start)).toBeUndefined()
    expect(board.occupantAt(outside)).toBeUndefined()
    expect(board.occupantAt(reboot)).toBe(robot.id)
    expect(robot.program).toEqual(program)
    expect(player.hand).toEqual([])
    expect(game.currentRegister).toBe(1)
  })

  it.each(edges)('does not fall through a wall on the $direction edge', ({ direction, start, outside }) => {
    const { board, robot, player, program, reboot, game } = createGame('MOVE_3', start, [direction])
    robot.turn([Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH].indexOf(direction))
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    game.executeNextAction()

    expect(board.positionOf(robot.id)).toEqual(start)
    expect(board.occupantAt(start)).toBe(robot.id)
    expect(board.occupantAt(outside)).toBeUndefined()
    expect(board.occupantAt(reboot)).toBeUndefined()
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
    const { board, robot, player, program, reboot, game } = createGame(instruction, start)
    const direction = robot.direction
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()

    expect(result).toMatchObject({
      registerIndex: 0,
      pushedRobots: [],
      action: { robotId: robot.id, card: program[0], position: reboot, direction },
    })
    expect(board.positionOf(robot.id)).toEqual(reboot)
    expect(board.occupantAt(start)).toBeUndefined()
    expect(robot.direction).toBe(direction)
    expect(robot.program).toEqual(program)
    expect(player.hand).toEqual([])
    expect(player.lastCheckpoint).toBe(1)
    expect(game.currentRegister).toBe(1)
    expect(game.lastActivePhase).toBe('activation')

    expect(game.executeNextAction().action.card).toBe(program[1])
    expect(board.positionOf(robot.id)).toEqual(reboot)
    expect(robot.program).toEqual(program)
    expect(game.currentRegister).toBe(2)
  })

  it('can reboot onto the only safe square after vacating it', () => {
    const reboot = { x: Integer(0), y: Integer(0) }
    const board = new Board([[new EmptyTile(), new EmptyTile()]], { x: Integer(1), y: Integer(0), angle: 0 }, reboot)
    const program = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'MOVE_3'))
    const player = placeTestPlayer(board, reboot, { direction: Direction.WEST, deck: new Deck(program) })
    const robot = player.robot
    const game = createTestGame({ board, players: [player], deck: program })
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    for (let register = 0; register < 5; register++) {
      expect(game.executeNextAction().action.position).toEqual(reboot)
      expect(board.occupantAt(reboot)).toBe(robot.id)
      expect(robot.direction).toBe(Direction.WEST)
    }
    expect(game.lastActivePhase).toBe('programming')
  })
})
