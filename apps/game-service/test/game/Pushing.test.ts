import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Board, Card, Direction, EmptyTile, Game, PitTile, Player, Robot, type Antenna, type Position, type Tile } from '@/game/index'
import { Integer, PositiveInteger } from '@/numbers'

function position(x: number, y = 3): Position {
  return { x: Integer(x), y: Integer(y) }
}

function grid(): Tile[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 9 }, () => new EmptyTile()))
}

function createGame(
  starts = [position(1), position(2), position(3)],
  tiles = grid(),
  antenna: Antenna = { ...position(0, 0), angle: 0 },
  reboot = position(0, 5),
) {
  const board = new Board(tiles, antenna)
  const directions = [Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH]
  const players = starts.map((start, index) => {
    const robot = new Robot(`robot-${index}`, directions[index % directions.length])
    board.placeRobot(robot.id, start)
    return new Player(`player-${index}`, robot)
  })
  const instructions: Instruction[] = ['MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN']
  const cards = instructions.map((instruction) => new Card(instruction, instruction))
  for (const player of players) player.deck.add(cards)
  const game = new Game({ board, players, deck: cards, rebootTile: reboot, random: () => 0 })
  return { board, players, robots: players.map((player) => player.robot), cards, game, reboot }
}

describe('robot pushing', () => {
  it('captures final pushed positions after every step and reboot, independently of later movement', () => {
    const tiles = grid()
    tiles[3][8] = new PitTile()
    const { robots, players, cards, game, reboot } = createGame([position(5), position(6), position(7)], tiles)
    const move = cards.find((card) => card.instruction === 'MOVE_2')!
    const program = [move, ...cards.filter((card) => card !== move).slice(0, 4)]
    for (const player of players) game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()
    const expected = [
      { robotId: robots[1].id, position: position(0, 4), direction: Direction.NORTH },
      { robotId: robots[2].id, position: reboot, direction: Direction.WEST },
    ]
    expect(result.pushedRobots).toEqual(expected)
    expect(result.registers[0]).toEqual({ status: 'REVEALED', instruction: move.instruction })
    expect(players[0].registers).toEqual(result.registers)
    for (const player of players.slice(1)) {
      expect(player.registers).toEqual(Array.from({ length: 5 }, () => ({ status: 'EMPTY' })))
    }
    game.moveRobot(robots[1], Direction.NORTH, PositiveInteger(1))
    expect(result.pushedRobots).toEqual(expected)
  })

  it.each([
    { direction: Direction.NORTH, starts: [position(4, 4), position(4, 3), position(4, 2)], ends: [position(4, 3), position(4, 2), position(4, 1)] },
    { direction: Direction.EAST, starts: [position(1), position(2), position(3)], ends: [position(2), position(3), position(4)] },
    { direction: Direction.SOUTH, starts: [position(4, 2), position(4, 3), position(4, 4)], ends: [position(4, 3), position(4, 4), position(4, 5)] },
    { direction: Direction.WEST, starts: [position(5), position(4), position(3)], ends: [position(4), position(3), position(2)] },
  ])('pushes a chain $direction and preserves all facing directions', ({ direction, starts, ends }) => {
    const { board, robots, game } = createGame(starts)
    const facing = robots.map((robot) => robot.direction)

    game.moveRobot(robots[0], direction, PositiveInteger(1))

    expect(robots.map((robot) => board.positionOf(robot.id))).toEqual(ends)
    expect(ends.map((end) => board.occupantAt(end))).toEqual(robots.map((robot) => robot.id))
    expect(board.occupantAt(starts[0])).toBeUndefined()
    expect(robots.map((robot) => robot.direction)).toEqual(facing)
    expect(game.hasStarted).toBe(false)
  })

  it.each([0, 1, 2, 3])('rejects the entire chain when boundary %s has a wall on either side', (boundary) => {
    for (const side of ['source', 'destination'] as const) {
      const tiles = grid()
      const x = 1 + boundary + (side === 'destination' ? 1 : 0)
      tiles[3][x] = new EmptyTile([side === 'source' ? Direction.EAST : Direction.WEST])
      const starts = [position(1), position(2), position(3), position(4)]
      const { board, robots, game } = createGame(starts, tiles)

      game.moveRobot(robots[0], Direction.EAST, PositiveInteger(1))

      expect(robots.map((robot) => board.positionOf(robot.id))).toEqual(starts)
      expect(starts.map((start) => board.occupantAt(start))).toEqual(robots.map((robot) => robot.id))
    }
  })

  it('rejects the entire chain when its destination is the priority antenna', () => {
    const starts = [position(1), position(2), position(3)]
    const { board, robots, game } = createGame(starts, grid(), { ...position(4), angle: 0 })

    game.moveRobot(robots[0], Direction.EAST, PositiveInteger(1))

    expect(robots.map((robot) => board.positionOf(robot.id))).toEqual(starts)
    expect(board.occupantAt(board.antenna)).toBeUndefined()
  })

  it('keeps successful steps when a later push is blocked', () => {
    const tiles = grid()
    tiles[3][5] = new EmptyTile([Direction.EAST])
    const { board, robots, game } = createGame(undefined, tiles)

    game.moveRobot(robots[0], Direction.EAST, PositiveInteger(3))

    expect(robots.map((robot) => board.positionOf(robot.id))).toEqual([position(3), position(4), position(5)])
  })

  it.each([
    { instruction: 'MOVE_1', steps: 1 },
    { instruction: 'MOVE_2', steps: 2 },
    { instruction: 'MOVE_3', steps: 3 },
    { instruction: 'BACK_UP', steps: 1 },
  ] as const)('pushes using $instruction without consuming another robot\'s action', ({ instruction, steps }) => {
    const { board, robots, players, cards, game } = createGame()
    if (instruction === 'BACK_UP') robots[0].turn(2)
    const facing = robots.map((robot) => robot.direction)
    const first = cards.find((card) => card.instruction === instruction)!
    const program = [first, ...cards.filter((card) => card !== first).slice(0, 4)]
    for (const player of players) game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(robots[0].id)

    expect(robots.map((robot) => board.positionOf(robot.id))).toEqual([position(1 + steps), position(2 + steps), position(3 + steps)])
    expect(robots.map((robot) => robot.direction)).toEqual(facing)
    expect(robots.map((robot) => robot.program)).toEqual(players.map(() => program))
    expect(game.currentRegister).toBe(0)
    expect(game.executeNextAction().action).toMatchObject({
      robotId: robots[1].id,
      position: position(2 + steps, instruction === 'BACK_UP' ? 4 : 3 - steps),
      direction: Direction.NORTH,
    })
    expect(game.executeNextAction().action.robotId).toBe(robots[2].id)
    expect(game.currentRegister).toBe(1)
  })

  it.each(['pit', 'edge'] as const)('reboots the farthest robot pushed into a %s and continues the movement card', (hazard) => {
    const tiles = grid()
    if (hazard === 'pit') tiles[3][8] = new PitTile()
    const starts = hazard === 'pit'
      ? [position(5), position(6), position(7)]
      : [position(6), position(7), position(8)]
    const { board, robots, reboot, game } = createGame(starts, tiles)

    game.moveRobot(robots[0], Direction.EAST, PositiveInteger(2))

    expect(robots.map((robot) => board.positionOf(robot.id))).toEqual([
      position(starts[0].x + 2), position(0, 4), reboot,
    ])
    expect(robots.map((robot) => robot.direction)).toEqual([Direction.EAST, Direction.NORTH, Direction.WEST])
    expect(board.occupantAt(position(hazard === 'pit' ? 8 : 9))).toBeUndefined()
    expect(board.occupantAt(starts[0])).toBeUndefined()
  })

  it('does not trigger a pit reboot through a wall at the end of the chain', () => {
    const tiles = grid()
    tiles[3][4] = new PitTile([Direction.WEST])
    const starts = [position(1), position(2), position(3)]
    const { board, robots, reboot, game } = createGame(starts, tiles)

    game.moveRobot(robots[0], Direction.EAST, PositiveInteger(1))

    expect(robots.map((robot) => board.positionOf(robot.id))).toEqual(starts)
    expect(board.occupantAt(reboot)).toBeUndefined()
  })

  it('executes a pushed robot\'s pending card from its reboot destination', () => {
    const tiles = grid()
    tiles[3][3] = new PitTile()
    const { board, players, robots, cards, reboot, game } = createGame([position(1), position(2)], tiles)
    const program = cards.slice(0, 5)
    for (const player of players) game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(robots[0].id)
    expect(board.positionOf(robots[1].id)).toEqual(reboot)
    expect(robots[1].program).toEqual(program)
    expect(game.currentRegister).toBe(0)
    expect(game.executeNextAction().action).toMatchObject({
      robotId: robots[1].id, card: program[0], position: position(0, 4), direction: Direction.NORTH,
    })
    expect(game.currentRegister).toBe(1)
  })

  it('can push a robot again immediately after it has rebooted', () => {
    const tiles = grid()
    tiles[3][3] = new PitTile()
    const reboot = position(2)
    const { board, robots, game } = createGame([position(1), position(2)], tiles, undefined, reboot)

    game.moveRobot(robots[0], Direction.EAST, PositiveInteger(1))
    expect(board.positionOf(robots[0].id)).toEqual(position(2))
    expect(board.positionOf(robots[1].id)).toEqual(position(2, 2))
    game.moveRobot(robots[0], Direction.NORTH, PositiveInteger(1))
    expect(board.positionOf(robots[0].id)).toEqual(position(2, 2))
    expect(board.positionOf(robots[1].id)).toEqual(position(2, 1))
    expect(robots[1].direction).toBe(Direction.NORTH)
  })

  it('can push a robot that already acted without activating it again', () => {
    const { board, robots, players, cards, game } = createGame([position(2), position(3)])
    const turn = cards.find((card) => card.instruction === 'TURN_LEFT')!
    const turnsFirst = [turn, ...cards.filter((card) => card !== turn).slice(0, 4)]
    const movesFirst = cards.slice(0, 5)
    robots[1].turn(1)
    game.submitProgram(players[0].id, turnsFirst.map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(players[1].id, movesFirst.map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(robots[0].id)
    expect(game.executeNextAction().action.robotId).toBe(robots[1].id)

    expect(board.positionOf(robots[0].id)).toEqual(position(1))
    expect(board.positionOf(robots[1].id)).toEqual(position(2))
    expect(robots[0].direction).toBe(Direction.NORTH)
    expect(robots[1].direction).toBe(Direction.WEST)
    expect(game.currentRegister).toBe(1)
  })

  it('awards a pushed robot its checkpoint only when the register finishes', () => {
    const tiles = grid()
    tiles[3][3] = new EmptyTile([], 1)
    tiles[6][8] = new EmptyTile([], 2)
    const { board, players, cards, game } = createGame([position(1), position(2)], tiles)
    const turn = cards.find((card) => card.instruction === 'TURN_LEFT')!
    const turnsFirst = [turn, ...cards.filter((card) => card !== turn).slice(0, 4)]
    game.submitProgram(players[0].id, cards.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(players[1].id, turnsFirst.map((card) => card.id))._unsafeUnwrap()

    game.executeNextAction()
    expect(board.positionOf(players[1].robot.id)).toEqual(position(3))
    expect(players[1].lastCheckpoint).toBe(0)
    game.executeNextAction()
    expect(players[1].lastCheckpoint).toBe(1)
    expect(game.currentRegister).toBe(1)
  })
})
