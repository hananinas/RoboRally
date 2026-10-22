import { Integer } from '@/numbers'
import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Board, Card, Direction, EmptyTile, Game, PitTile, Player, Robot, type Tile } from '@/game/index'

function createGame(
  pit = { x: Integer(1), y: Integer(1) },
  rebootTile = { x: Integer(0), y: Integer(2) },
  walls: readonly Direction[] = [],
  startWalls: readonly Direction[] = [],
) {
  const tiles: Tile[][] = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  tiles[1][0] = new EmptyTile(startWalls)
  tiles[pit.y][pit.x] = new PitTile(walls)
  const board = new Board(tiles, { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
  const robot = new Robot('robot', Direction.EAST)
  board.placeRobot(robot.id, { x: Integer(0), y: Integer(1) })
  const player = new Player('player', robot)
  const cards = {
    MOVE_1: new Card('move-1', 'MOVE_1'),
    MOVE_2: new Card('move-2', 'MOVE_2'),
    MOVE_3: new Card('move-3', 'MOVE_3'),
    BACK_UP: new Card('back', 'BACK_UP'),
    TURN_LEFT: new Card('left', 'TURN_LEFT'),
    TURN_RIGHT: new Card('right', 'TURN_RIGHT'),
    U_TURN: new Card('uturn', 'U_TURN'),
  }
  const game = new Game(board, [player], Object.values(cards), undefined, rebootTile)
  return { board, robot, player, cards, game }
}

describe('pit entry and rebooting', () => {
  it.each([
    { instruction: 'MOVE_1', pitX: 1 },
    { instruction: 'MOVE_2', pitX: 1 },
    { instruction: 'MOVE_2', pitX: 2 },
    { instruction: 'MOVE_3', pitX: 1 },
    { instruction: 'MOVE_3', pitX: 2 },
    { instruction: 'MOVE_3', pitX: 3 },
    { instruction: 'BACK_UP', pitX: 1 },
  ] as const)('reboots during $instruction on step $pitX', ({ instruction, pitX }) => {
    const { board, robot, player, cards, game } = createGame({ x: Integer(pitX), y: Integer(1) })
    if (instruction === 'BACK_UP') robot.turn(2)
    const direction = robot.direction
    const first = cards[instruction]
    const program = [first, ...Object.values(cards).filter((card) => card !== first).slice(0, 4)]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction()).toEqual({
      registerIndex: 0,
      action: { robotId: robot.id, card: first, position: { x: Integer(0), y: Integer(2) }, direction },
    })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.occupantAt({ x: Integer(pitX), y: Integer(1) })).toBeUndefined()
    expect(robot.program).toEqual(program)
    expect(game.currentRegister).toBe(1)
  })

  it.each([
    { wall: 'source', pitWalls: [], startWalls: [Direction.EAST] },
    { wall: 'destination', pitWalls: [Direction.WEST], startWalls: [] },
  ])('does not reboot when the $wall wall blocks pit entry', ({ pitWalls, startWalls }) => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, undefined, pitWalls, startWalls)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it('stops at an occupied tile after a successful step without reaching the pit', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(3), y: Integer(1) })
    const other = game.addPlayer()._unsafeUnwrap()
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, [4, 5, 6, 0, 1].map((index) => other.hand[index].id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(other.robot.id)
    expect(game.executeNextAction().action.position).toEqual({ x: Integer(1), y: Integer(1) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(1), y: Integer(1) })
    expect(board.positionOf(other.robot.id)).toEqual({ x: Integer(2), y: Integer(1) })
    expect(board.occupantAt({ x: Integer(3), y: Integer(1) })).toBeUndefined()
  })

  it('stops at the board boundary without rebooting', () => {
    const { board, robot, player, cards: c, game } = createGame()
    robot.turn(2)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
    expect(robot.direction).toBe(Direction.WEST)
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it('discards the rest of the current move while executing later registers normally', () => {
    const { board, robot, player, cards: c, game } = createGame()
    const program = [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const actions = program.map(() => game.executeNextAction().action)
    expect(actions.map(({ position, direction }) => ({ position, direction }))).toEqual([
      { position: { x: Integer(0), y: Integer(2) }, direction: Direction.EAST },
      { position: { x: Integer(1), y: Integer(2) }, direction: Direction.EAST },
      { position: { x: Integer(1), y: Integer(2) }, direction: Direction.NORTH },
      { position: { x: Integer(1), y: Integer(2) }, direction: Direction.EAST },
      { position: { x: Integer(0), y: Integer(2) }, direction: Direction.EAST },
    ])
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(game.phase).toBe('programming')
    expect(robot.program).toEqual([])
    expect(player.hand).toEqual(Object.values(c))
  })

  it('supports repeated falls without canceling the program or resetting orientation', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, { x: Integer(0), y: Integer(1) })
    const program = [c.MOVE_1, c.MOVE_2, c.MOVE_3, c.TURN_LEFT, c.TURN_RIGHT]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    for (let registerIndex = 0; registerIndex < 3; registerIndex++) {
      const result = game.executeNextAction()
      expect(result.registerIndex).toBe(registerIndex)
      expect(result.action.position).toEqual({ x: Integer(0), y: Integer(1) })
      expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
      expect(robot.program).toEqual(program)
    }
    expect(game.executeNextAction().action.direction).toBe(Direction.NORTH)
    expect(game.executeNextAction().action.direction).toBe(Direction.EAST)
    expect(game.phase).toBe('programming')
  })

  it('uses a free fallback when another player occupies the reboot tile', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, { x: Integer(2), y: Integer(1) })
    const other = game.addPlayer()._unsafeUnwrap()
    other.robot.turn(1)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, [4, 5, 6, 0, 1].map((index) => other.hand[index].id))._unsafeUnwrap()
    expect(game.executeNextAction().action.robotId).toBe(other.robot.id)

    const { action } = game.executeNextAction()
    expect(action.robotId).toBe(robot.id)
    expect(action.position).toEqual({ x: Integer(2), y: Integer(0) })
    expect(board.occupantAt({ x: Integer(2), y: Integer(1) })).toBe(other.robot.id)
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBe(robot.id)
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it.each([
    { rebootTile: { x: Integer(0), y: Integer(1) }, expectedProgress: 1 },
    { rebootTile: { x: Integer(1), y: Integer(0) }, expectedProgress: 2 },
  ])('evaluates checkpoints at the reboot destination $rebootTile', ({ rebootTile, expectedProgress }) => {
    const board = new Board([
      [new EmptyTile(), new EmptyTile([], 2), new PitTile()],
      [new EmptyTile(), new EmptyTile([], 1), new EmptyTile()],
    ], { x: Integer(1), y: Integer(0), angle: Math.PI / 2 })
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    player.completeCheckpoint(1)
    const instructions: Instruction[] = ['MOVE_3', 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'BACK_UP']
    const program = instructions.map((instruction, index) => new Card(`card-${index}`, instruction))
    const game = new Game(board, [player], program, undefined, rebootTile)
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual(rebootTile)
    expect(player.lastCheckpoint).toBe(expectedProgress)
    expect(robot.program).toEqual(program)
  })
})
