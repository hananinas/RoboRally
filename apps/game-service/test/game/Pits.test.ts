import { resolveRobotAction } from '../activationTestHelper.js'
import { Integer } from '@/numbers'
import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Board, Card, Direction, EmptyTile, PitTile, type Player, type Position, type Tile } from '@/game/index'
import { Deck } from '@/game/Deck'
import { createBoard } from '@/game/BoardFactory'
import { addTestPlayer, createEmptyTileGrid, createTestGame, placeTestPlayer, programLeadingWith, withRebootTiles } from '../fixtures.ts'

function createGame(
  pit = { x: Integer(1), y: Integer(1) },
  rebootTiles: readonly Position[] = [{ x: Integer(0), y: Integer(2) }],
  walls: readonly Direction[] = [],
) {
  const tiles: Tile[][] = createEmptyTileGrid(5, 3)
  tiles[pit.y][pit.x] = new PitTile(walls)
  const board = new Board(withRebootTiles(tiles, ...rebootTiles), { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
  const cards = {
    MOVE_1: new Card('move-1', 'MOVE_1'),
    MOVE_2: new Card('move-2', 'MOVE_2'),
    MOVE_3: new Card('move-3', 'MOVE_3'),
    BACK_UP: new Card('back', 'BACK_UP'),
    TURN_LEFT: new Card('left', 'TURN_LEFT'),
    TURN_RIGHT: new Card('right', 'TURN_RIGHT'),
    U_TURN: new Card('uturn', 'U_TURN'),
  }
  const player = placeTestPlayer(board, { x: Integer(0), y: Integer(1) }, {
    direction: Direction.EAST, deck: new Deck(Object.values(cards)),
  })
  const robot = player.robot
  const game = createTestGame({ board, players: [player], deck: Object.values(cards) })
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
    const program = programLeadingWith(Object.values(cards), instruction)
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game)).toMatchObject({
      registerIndex: 0,
      pushedRobots: [],
      action: { robotId: robot.id, card: program[0], position: { x: Integer(0), y: Integer(2) }, direction },
    })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.occupantAt({ x: Integer(pitX), y: Integer(1) })).toBeUndefined()
    expect(robot.program).toEqual([])
    expect(player.hand).toHaveLength(Object.values(cards).length)
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
  })

  it('does not reboot when a wall blocks a movement card from entering a pit', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, undefined, [Direction.WEST])
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
  })

  it('pushes another robot into a pit before rebooting itself later in the same move', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(3), y: Integer(1) })
    const other = addTestPlayer(game)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, programLeadingWith(other.hand, 'TURN_LEFT').map((card) => card.id))._unsafeUnwrap()

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

  it('discards the rest of the round\'s program when the first register falls into a pit', () => {
    const { board, robot, player, cards: c, game } = createGame()
    const program = [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    expect(result).toMatchObject({
      registerIndex: 0,
      pushedRobots: [],
      action: { robotId: robot.id, card: c.MOVE_3, position: { x: Integer(0), y: Integer(2) }, direction: Direction.EAST },
      roundConcluded: true,
    })
    expect(result.registers.slice(1)).toEqual(Array.from({ length: 4 }, () => ({ status: 'HIDDEN' })))
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(robot.program).toEqual([])
    expect(player.hand).toHaveLength(Object.values(c).length)
    expect(player.hand).toEqual(expect.arrayContaining(Object.values(c)))
    expect(game.lastActivePhase).toBe('programming')
    expect(() => game.executeNextAction()).toThrow()
  })

  it('keeps its facing when rebooting onto the tile it vacated', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, [{ x: Integer(0), y: Integer(1) }])
    const program = [c.MOVE_1, c.MOVE_2, c.MOVE_3, c.TURN_LEFT, c.TURN_RIGHT]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    expect(result.action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(result.action.direction).toBe(Direction.EAST)
    expect(result.roundConcluded).toBe(true)
    expect(board.occupantAt({ x: Integer(1), y: Integer(1) })).toBeUndefined()
    expect(robot.program).toEqual([])
    expect(game.lastActivePhase).toBe('programming')
  })

  it('reboots on the reboot tile closest to the pit', () => {
    const rebootTiles = [{ x: Integer(4), y: Integer(2) }, { x: Integer(0), y: Integer(2) }]
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
  })

  it('breaks a tie between equally close reboot tiles in reading order', () => {
    const rebootTiles = [{ x: Integer(2), y: Integer(2) }, { x: Integer(0), y: Integer(0) }]
    const { player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(0) })
  })

  it('uses the next closest reboot tile when the closest one is taken', () => {
    const rebootTiles = [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }]
    const { board, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    board.placeRobot('blocker', { x: Integer(0), y: Integer(2) })
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(4), y: Integer(2) })
    expect(board.positionOf('blocker')).toEqual({ x: Integer(0), y: Integer(2) })
  })

  it('falls back to the nearest free tile when every reboot tile is taken', () => {
    const rebootTiles = [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }]
    const { board, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    board.placeRobot('blocker-1', { x: Integer(0), y: Integer(2) })
    board.placeRobot('blocker-2', { x: Integer(4), y: Integer(2) })
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    // Nearest free tile to the closest reboot tile (0,2); (0,1) wins the tie by being higher up.
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
  })

  it('skips the antenna when choosing a fallback for an occupied reboot tile', () => {
    const { board, robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, [{ x: Integer(2), y: Integer(1) }])
    const other = addTestPlayer(game)
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
    const board = new Board(withRebootTiles([
      [new EmptyTile(), new EmptyTile([], 2), new PitTile()],
      [new EmptyTile(), new EmptyTile([], 1), new EmptyTile()],
      [new EmptyTile([], 3), new EmptyTile(), new EmptyTile()],
    ], rebootTile), { x: Integer(2), y: Integer(1), angle: Math.PI / 2 })
    const instructions: Instruction[] = ['MOVE_3', 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'BACK_UP']
    const program = instructions.map((instruction, index) => new Card(`card-${index}`, instruction))
    const player = placeTestPlayer(board, { x: Integer(0), y: Integer(0) }, {
      direction: Direction.EAST, deck: new Deck(program),
    })
    player.completeCheckpoint(1)
    const game = createTestGame({ board, players: [player], deck: program })
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(rebootTile)
    expect(player.lastCheckpoint).toBe(expectedProgress)
    expect(player.robot.program).toEqual([])
  })
})

function createRoundGame(instructions: readonly Instruction[]) {
  const tiles = createEmptyTileGrid(5, 5)
  tiles[2][0] = new PitTile()
  const board = new Board(withRebootTiles(tiles, { x: Integer(1), y: Integer(0) }), { x: Integer(4), y: Integer(4), angle: 0 })
  const deck = instructions.map((instruction, index) => new Card(`card-${index}`, instruction))
  const player = placeTestPlayer(board, { x: Integer(1), y: Integer(2) }, {
    id: 'robot', direction: Direction.EAST, deck: new Deck(deck),
  })
  const game = createTestGame({ board, players: [player], deck })
  return { board, robot: player.robot, player, deck, game }
}

describe('reboot cancels the rest of the round', () => {
  it('falls in register 1, executes nothing afterwards, and returns to programming', () => {
    const { board, robot, player, deck, game } = createRoundGame(
      ['U_TURN', 'MOVE_1', 'MOVE_2', 'TURN_LEFT', 'TURN_RIGHT'],
    )
    game.submitProgram(player.id, deck.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action).toMatchObject({
      robotId: robot.id, position: { x: Integer(1), y: Integer(2) }, direction: Direction.WEST,
    })

    const fall = game.executeNextStep()

    expect(fall).toMatchObject({
      type: 'robot',
      result: {
        registerIndex: 1,
        action: { robotId: robot.id, card: deck[1], position: { x: Integer(1), y: Integer(0) }, direction: Direction.WEST },
        reboots: [{ robotId: robot.id, fellAt: { x: 0, y: 2 }, landedAt: { x: 1, y: 0 } }],
        roundConcluded: false,
      },
    })
    if (fall.type !== 'robot') throw new Error('Expected a robot action')
    expect(fall.result.registers.slice(2)).toEqual(Array.from({ length: 3 }, () => ({ status: 'HIDDEN' })))
    expect(game.executeNextStep()).toMatchObject({
      type: 'environment', result: { kind: 'GEARS', roundConcluded: false },
    })
    expect(game.executeNextStep()).toMatchObject({
      type: 'environment', result: { kind: 'CHECKPOINTS', roundConcluded: true },
    })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(1), y: Integer(0) })
    expect(robot.program).toEqual([])
    expect(player.hand).toEqual(expect.arrayContaining(deck))
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(() => game.executeNextAction()).toThrow()
  })

  it('still resolves every remaining register for the other robots after one reboots', () => {
    const tiles = createEmptyTileGrid(5, 5)
    tiles[2][2] = new PitTile()
    const board = new Board(withRebootTiles(tiles, { x: Integer(1), y: Integer(0) }), { x: Integer(4), y: Integer(4), angle: 0 })
    const instructions: Instruction[] = ['TURN_LEFT', 'TURN_RIGHT', 'TURN_LEFT', 'TURN_RIGHT', 'MOVE_1']
    const cardsFor = (owner: string) => instructions.map((instruction, index) => new Card(`${owner}-${index}`, instruction))
    const fallerPlayer = placeTestPlayer(board, { x: Integer(1), y: Integer(2) }, {
      id: 'faller', direction: Direction.EAST, deck: new Deck(cardsFor('faller')),
    })
    const otherPlayer = placeTestPlayer(board, { x: Integer(3), y: Integer(3) }, {
      id: 'other', direction: Direction.EAST, deck: new Deck(cardsFor('other')),
    })
    const faller = fallerPlayer.robot
    const other = otherPlayer.robot
    const game = createTestGame({ board, players: [fallerPlayer, otherPlayer], deck: cardsFor('template') })
    const programFor = (player: Player, instructions: readonly Instruction[]) => {
      const hand = [...player.hand]
      return instructions.map((instruction) => hand.splice(hand.findIndex((card) => card.instruction === instruction), 1)[0])
    }
    game.submitProgram(fallerPlayer.id, programFor(fallerPlayer, ['MOVE_1', 'TURN_LEFT', 'TURN_RIGHT', 'TURN_LEFT', 'TURN_RIGHT']).map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(otherPlayer.id, programFor(otherPlayer, ['TURN_LEFT', 'TURN_RIGHT', 'TURN_LEFT', 'TURN_RIGHT', 'MOVE_1']).map((card) => card.id))._unsafeUnwrap()

    const actions = Array.from({ length: 6 }, () => resolveRobotAction(game))

    expect(actions.map(({ registerIndex, action }) => [registerIndex, action.robotId])).toEqual([
      [0, other.id],
      [0, faller.id],
      [1, other.id],
      [2, other.id],
      [3, other.id],
      [4, other.id],
    ])
    expect(actions.map(({ roundConcluded }) => roundConcluded)).toEqual([false, false, false, false, false, true])
    expect(board.positionOf(faller.id)).toEqual({ x: Integer(1), y: Integer(0) })
    expect(board.positionOf(other.id)).toEqual({ x: Integer(4), y: Integer(3) })
    expect(faller.program).toEqual([])
    expect(other.program).toEqual([])
    expect(game.lastActivePhase).toBe('programming')
  })

  it('lets the rebooted robot act normally once the next round starts', () => {
    const { robot, player, deck, game } = createRoundGame(['U_TURN', 'MOVE_1', 'MOVE_2', 'TURN_LEFT', 'TURN_RIGHT'])
    game.submitProgram(player.id, deck.map((card) => card.id))._unsafeUnwrap()
    resolveRobotAction(game)
    expect(resolveRobotAction(game).roundConcluded).toBe(true)
    expect(game.lastActivePhase).toBe('programming')

    const nextProgram = player.hand.map((card) => card.id)
    game.submitProgram(player.id, nextProgram)._unsafeUnwrap()

    expect(game.lastActivePhase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(resolveRobotAction(game).action).toMatchObject({ robotId: robot.id, card: { id: nextProgram[0] } })
  })
})

describe('reboots reported in action results', () => {
  const moveCards = () => [
    new Card('move-3', 'MOVE_3'), new Card('move-1', 'MOVE_1'), new Card('left', 'TURN_LEFT'),
    new Card('right', 'TURN_RIGHT'), new Card('uturn', 'U_TURN'),
  ]

  // Regression: the reboot tile (13,2) is on the path, so the final position alone hides the fall.
  it('reports the fall when MOVE_3 crosses a reboot tile into a pit on Test Map', () => {
    const board = createBoard('test-map')
    const cards = moveCards()
    const player = placeTestPlayer(board, { x: Integer(13), y: Integer(1) }, {
      id: 'robot', direction: Direction.SOUTH, deck: new Deck(cards),
    })
    const game = createTestGame({ board, players: [player], deck: cards })
    game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    expect(result.action.position).toEqual({ x: 13, y: 2 })
    expect(result.reboots).toEqual([{ robotId: 'robot', fellAt: { x: 13, y: 4 }, landedAt: { x: 13, y: 2 } }])
  })

  it('reports the square just outside the board when a robot drives off the edge', () => {
    const { robot, player, cards: c, game } = createGame()
    robot.turn(2) // EAST -> WEST, facing the edge
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).reboots).toEqual([
      { robotId: robot.id, fellAt: { x: -1, y: 1 }, landedAt: { x: 0, y: 2 } },
    ])
  })

  it('reports a pushed robot and the acting robot in the order they fell', () => {
    const tiles = createEmptyTileGrid(5, 3)
    tiles[1][2] = new PitTile()
    const board = new Board(
      withRebootTiles(tiles, { x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }),
      { x: Integer(0), y: Integer(0), angle: Math.PI / 2 },
    )
    const pusherCards = moveCards()
    const pushedCards = moveCards().map((card) => new Card(`pushed-${card.id}`, card.instruction))
    // The pusher at (0,1) is closer to the antenna (0,0), so it acts first.
    const pusher = placeTestPlayer(board, { x: Integer(0), y: Integer(1) }, {
      id: 'pusher', direction: Direction.EAST, deck: new Deck(pusherCards),
    })
    const pushed = placeTestPlayer(board, { x: Integer(1), y: Integer(1) }, {
      id: 'pushed', direction: Direction.NORTH, deck: new Deck(pushedCards),
    })
    const game = createTestGame({ board, players: [pusher, pushed], deck: [...pusherCards, ...pushedCards] })
    game.submitProgram(pusher.id, pusherCards.map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(pushed.id, programLeadingWith(pushedCards, 'TURN_LEFT').map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    // Both fall at (2,1). The pushed robot takes (0,2), first in reading order of the
    // equally close tiles, so the pusher lands on (4,2).
    expect(result.action.robotId).toBe('pusher')
    expect(result.reboots).toEqual([
      { robotId: 'pushed', fellAt: { x: 2, y: 1 }, landedAt: { x: 0, y: 2 } },
      { robotId: 'pusher', fellAt: { x: 2, y: 1 }, landedAt: { x: 4, y: 2 } },
    ])
  })

  // A pushed robot can land back where it started. pushedRobots then leaves it out, and only
  // reboots shows that it fell.
  it('reports a pushed robot that reboots onto its starting tile only in reboots', () => {
    const tiles = createEmptyTileGrid(5, 3)
    tiles[1][3] = new PitTile()
    const board = new Board(
      withRebootTiles(tiles, { x: Integer(1), y: Integer(1) }, { x: Integer(4), y: Integer(2) }),
      { x: Integer(0), y: Integer(0), angle: Math.PI / 2 },
    )
    const pusherCards = moveCards()
    const pushedCards = moveCards().map((card) => new Card(`pushed-${card.id}`, card.instruction))
    const pusher = placeTestPlayer(board, { x: Integer(0), y: Integer(1) }, {
      id: 'pusher', direction: Direction.EAST, deck: new Deck(pusherCards),
    })
    const pushed = placeTestPlayer(board, { x: Integer(1), y: Integer(1) }, {
      id: 'pushed', direction: Direction.NORTH, deck: new Deck(pushedCards),
    })
    const game = createTestGame({ board, players: [pusher, pushed], deck: [...pusherCards, ...pushedCards] })
    game.submitProgram(pusher.id, pusherCards.map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(pushed.id, programLeadingWith(pushedCards, 'TURN_LEFT').map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)

    // MOVE_3 pushes the robot from (1,1) into the pit at (3,1); by then (1,1) is free again,
    // so it reboots where it started. The pusher follows it in and takes the other tile.
    expect(result.action.position).toEqual({ x: 4, y: 2 })
    expect(result.pushedRobots).toEqual([])
    expect(result.reboots).toEqual([
      { robotId: 'pushed', fellAt: { x: 3, y: 1 }, landedAt: { x: 1, y: 1 } },
      { robotId: 'pusher', fellAt: { x: 3, y: 1 }, landedAt: { x: 4, y: 2 } },
    ])
  })

  it('reports no reboots when nobody falls', () => {
    const { player, cards: c, game } = createGame()
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'TURN_LEFT').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).reboots).toEqual([])
  })
})
