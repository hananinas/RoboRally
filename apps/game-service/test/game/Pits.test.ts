import { resolveRobotAction } from '../activationTestHelper.js'
import { Integer } from '@/numbers'
import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Board, Card, Direction, EmptyTile, Game, PitTile, Player, Robot, type Position, type Tile } from '@/game/index'

function createGame(
  pit = { x: Integer(1), y: Integer(1) },
  rebootTiles: readonly Position[] = [{ x: Integer(0), y: Integer(2) }],
  walls: readonly Direction[] = [],
) {
  const tiles: Tile[][] = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
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
  player.deck.add(Object.values(cards))
  const game = new Game({ board, players: [player], deck: Object.values(cards), rebootTiles, random: () => 0 })
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

    expect(resolveRobotAction(game)).toMatchObject({
      registerIndex: 0,
      pushedRobots: [],
      action: { robotId: robot.id, card: first, position: { x: Integer(0), y: Integer(2) }, direction },
    })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.occupantAt({ x: Integer(pitX), y: Integer(1) })).toBeUndefined()
    expect(robot.program).toEqual(program)
    expect(game.currentRegister).toBe(1)
  })

  it('does not reboot when a wall blocks a movement card from entering a pit', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, undefined, [Direction.WEST])
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it('pushes another robot into a pit and resolves a later fall during the same move', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(3), y: Integer(1) })
    const other = game.addPlayer()._unsafeUnwrap()
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, [4, 5, 6, 0, 1].map((index) => other.hand[index].id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.robotId).toBe(other.robot.id)
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.positionOf(other.robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.occupantAt({ x: Integer(3), y: Integer(1) })).toBeUndefined()
  })

  it('reboots at the board boundary just like a pit', () => {
    const { board, robot, player, cards: c, game } = createGame()
    robot.turn(2)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(robot.direction).toBe(Direction.WEST)
    expect(board.occupantAt({ x: Integer(0), y: Integer(1) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it('discards the rest of the current move while executing later registers normally', () => {
    const { board, robot, player, cards: c, game } = createGame()
    const program = [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const actions = program.map(() => resolveRobotAction(game).action)
    expect(actions.map(({ position, direction }) => ({ position, direction }))).toEqual([
      { position: { x: Integer(0), y: Integer(2) }, direction: Direction.EAST },
      { position: { x: Integer(1), y: Integer(2) }, direction: Direction.EAST },
      { position: { x: Integer(1), y: Integer(2) }, direction: Direction.NORTH },
      { position: { x: Integer(1), y: Integer(2) }, direction: Direction.EAST },
      { position: { x: Integer(0), y: Integer(2) }, direction: Direction.EAST },
    ])
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(game.lastActivePhase).toBe('programming')
    expect(robot.program).toEqual([])
    expect(player.hand).toHaveLength(Object.values(c).length)
    expect(player.hand).toEqual(expect.arrayContaining(Object.values(c)))
  })

  it('supports repeated falls without canceling the program or resetting orientation', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, [{ x: Integer(0), y: Integer(1) }])
    const program = [c.MOVE_1, c.MOVE_2, c.MOVE_3, c.TURN_LEFT, c.TURN_RIGHT]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    for (let registerIndex = 0; registerIndex < 3; registerIndex++) {
      const result = resolveRobotAction(game)
      expect(result.registerIndex).toBe(registerIndex)
      expect(result.action.position).toEqual({ x: Integer(0), y: Integer(1) })
      expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
      expect(robot.program).toEqual(program)
    }
    expect(resolveRobotAction(game).action.direction).toBe(Direction.NORTH)
    expect(resolveRobotAction(game).action.direction).toBe(Direction.EAST)
    expect(game.lastActivePhase).toBe('programming')
  })

  it.each([
    { order: 'far first', rebootTiles: [{ x: Integer(4), y: Integer(2) }, { x: Integer(0), y: Integer(2) }] },
    { order: 'near first', rebootTiles: [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }] },
  ])('reboots on the reboot tile closest to the pit ($order)', ({ rebootTiles }) => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    game.submitProgram(player.id, [c.MOVE_1, c.MOVE_2, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
  })

  it('keeps map order when two reboot tiles are equally close', () => {
    const rebootTiles = [{ x: Integer(2), y: Integer(2) }, { x: Integer(0), y: Integer(2) }]
    const { player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    game.submitProgram(player.id, [c.MOVE_1, c.MOVE_2, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual({ x: Integer(2), y: Integer(2) })
  })

  it('uses the next closest reboot tile when the closest one is taken', () => {
    const rebootTiles = [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }]
    const { board, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    board.placeRobot('blocker', { x: Integer(0), y: Integer(2) })
    game.submitProgram(player.id, [c.MOVE_1, c.MOVE_2, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual({ x: Integer(4), y: Integer(2) })
    expect(board.positionOf('blocker')).toEqual({ x: Integer(0), y: Integer(2) })
  })

  it('falls back to the nearest free tile when every reboot tile is taken', () => {
    const rebootTiles = [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }]
    const { board, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    board.placeRobot('blocker-1', { x: Integer(0), y: Integer(2) })
    board.placeRobot('blocker-2', { x: Integer(4), y: Integer(2) })
    game.submitProgram(player.id, [c.MOVE_1, c.MOVE_2, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    // Nearest free tile to the closest reboot tile (0,2); (0,1) wins the tie by being higher up.
    expect(game.executeNextAction().action.position).toEqual({ x: Integer(0), y: Integer(1) })
  })

  it('skips the antenna when choosing a fallback for an occupied reboot tile', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, [{ x: Integer(2), y: Integer(1) }])
    const other = game.addPlayer()._unsafeUnwrap()
    other.robot.turn(1)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, [4, 5, 6, 0, 1].map((index) => other.hand[index].id))._unsafeUnwrap()
    expect(resolveRobotAction(game).action.robotId).toBe(other.robot.id)

    const { action } = resolveRobotAction(game)
    expect(action.robotId).toBe(robot.id)
    expect(action.position).toEqual({ x: Integer(3), y: Integer(1) })
    expect(board.occupantAt({ x: Integer(2), y: Integer(1) })).toBe(other.robot.id)
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(3), y: Integer(1) })).toBe(robot.id)
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it.each([
    { rebootTile: { x: Integer(0), y: Integer(1) }, expectedProgress: 1 },
    { rebootTile: { x: Integer(1), y: Integer(0) }, expectedProgress: 2 },
  ])('evaluates checkpoints at the reboot destination $rebootTile', ({ rebootTile, expectedProgress }) => {
    const board = new Board([
      [new EmptyTile(), new EmptyTile([], 2), new PitTile()],
      [new EmptyTile(), new EmptyTile([], 1), new EmptyTile()],
      [new EmptyTile([], 3), new EmptyTile(), new EmptyTile()],
    ], { x: Integer(2), y: Integer(1), angle: Math.PI / 2 })
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    player.completeCheckpoint(1)
    const instructions: Instruction[] = ['MOVE_3', 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'BACK_UP']
    const program = instructions.map((instruction, index) => new Card(`card-${index}`, instruction))
    player.deck.add(program)
    const game = new Game({ board, players: [player], deck: program, rebootTiles: [rebootTile], random: () => 0 })
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(rebootTile)
    expect(player.lastCheckpoint).toBe(expectedProgress)
    expect(robot.program).toEqual(program)
  })
})
