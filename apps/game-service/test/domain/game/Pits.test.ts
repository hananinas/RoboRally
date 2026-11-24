import { resolveRobotAction } from '../../activationTestHelper.js'
import { Integer } from '@/numbers'
import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card, Direction, EmptyTile, PitTile, type Position, type Tile } from '@/domain/game/index'
import { Deck } from '@/domain/game/Deck'
import { createBoard } from '@/domain/game/BoardFactory'
import { boardMaps } from '@/domain/game/boardMaps'
import { addTestPlayer, createEmptyTileGrid, createTestBoard, createTestGame, createTestPlacement, programLeadingWith } from '../../fixtures.ts'

function createGame(
  pit = { x: Integer(1), y: Integer(1) },
  rebootTiles: readonly Position[] = [{ x: Integer(0), y: Integer(2) }],
  walls: readonly Direction[] = [],
  startTiles?: Position[],
) {
  const tiles: Tile[][] = createEmptyTileGrid(5, 3)
  tiles[pit.y][pit.x] = new PitTile(walls)
  const board = createTestBoard(tiles, { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }, rebootTiles, startTiles)
  const cards = {
    MOVE_1: new Card('move-1', 'MOVE_1'),
    MOVE_2: new Card('move-2', 'MOVE_2'),
    MOVE_3: new Card('move-3', 'MOVE_3'),
    BACK_UP: new Card('back', 'BACK_UP'),
    TURN_LEFT: new Card('left', 'TURN_LEFT'),
    TURN_RIGHT: new Card('right', 'TURN_RIGHT'),
    U_TURN: new Card('uturn', 'U_TURN'),
  }
  const placement = createTestPlacement({ x: Integer(0), y: Integer(1) }, {
    direction: Direction.EAST, deck: new Deck(Object.values(cards)),
  })
  const { player } = placement
  const robot = player.robot
  const game = createTestGame({ board, players: [placement], deck: Object.values(cards) })
  return { robot, player, cards, game }
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
    const { robot, player, cards, game } = createGame({ x: Integer(pitX), y: Integer(1) })
    if (instruction === 'BACK_UP') robot.turn(2)
    const direction = robot.direction
    const program = programLeadingWith(Object.values(cards), instruction)
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game)).toMatchObject({
      registerIndex: 0,
      pushedRobots: [],
      action: { robotId: robot.id, card: program[0], position: { x: Integer(0), y: Integer(2) }, direction },
    })
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(robot.program).toEqual(program)
    expect(game.currentRegister).toBe(1)
  })

  it('does not reboot when a wall blocks a movement card from entering a pit', () => {
    const { robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, undefined, [Direction.WEST])
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
  })

  it('pushes another robot into a pit and resolves a later fall during the same move', () => {
    const { robot, player, cards: c, game } = createGame(
      { x: Integer(3), y: Integer(1) },
      undefined,
      undefined,
      [{ x: Integer(2), y: Integer(1) }],
    )
    const other = addTestPlayer(game)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, programLeadingWith(other.hand, 'TURN_LEFT').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.robotId).toBe(other.robot.id)
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
    expect(game.getRobotPosition(other.robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
  })

  it('reboots at the board boundary just like a pit', () => {
    const { robot, player, cards: c, game } = createGame()
    robot.turn(2)
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(robot.direction).toBe(Direction.WEST)
  })

  it('discards the rest of the current move while executing later registers normally', () => {
    const { robot, player, cards: c, game } = createGame()
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
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
    expect(game.lastActivePhase).toBe('programming')
    expect(robot.program).toEqual([])
    expect(player.hand).toHaveLength(Object.values(c).length)
    expect(player.hand).toEqual(expect.arrayContaining(Object.values(c)))
  })

  it('supports repeated falls without canceling the program or resetting orientation', () => {
    const { robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, [{ x: Integer(0), y: Integer(1) }])
    const program = [c.MOVE_1, c.MOVE_2, c.MOVE_3, c.TURN_LEFT, c.TURN_RIGHT]
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    for (let registerIndex = 0; registerIndex < 3; registerIndex++) {
      const result = resolveRobotAction(game)
      expect(result.registerIndex).toBe(registerIndex)
      expect(result.action.position).toEqual({ x: Integer(0), y: Integer(1) })
      expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(1) })
      expect(robot.program).toEqual(program)
    }
    expect(resolveRobotAction(game).action.direction).toBe(Direction.NORTH)
    expect(resolveRobotAction(game).action.direction).toBe(Direction.EAST)
    expect(game.lastActivePhase).toBe('programming')
  })

  it('reboots on the reboot tile closest to the pit', () => {
    const rebootTiles = [{ x: Integer(4), y: Integer(2) }, { x: Integer(0), y: Integer(2) }]
    const { robot, player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(0), y: Integer(2) })
  })

  it('breaks a tie between equally close reboot tiles in reading order', () => {
    const rebootTiles = [{ x: Integer(2), y: Integer(2) }, { x: Integer(0), y: Integer(0) }]
    const { player, cards: c, game } = createGame({ x: Integer(1), y: Integer(1) }, rebootTiles)
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(0) })
  })

  it('uses the next closest reboot tile when the closest one is taken', () => {
    const rebootTiles = [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }]
    const { player, cards: c, game } = createGame(
      { x: Integer(1), y: Integer(1) }, rebootTiles, undefined, [{ x: Integer(2), y: Integer(1) }],
    )
    const earlier = addTestPlayer(game)
    earlier.robot.turn(1) // NORTH -> WEST, also facing the pit
    game.submitProgram(player.id, programLeadingWith(Object.values(c), 'MOVE_1').map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(earlier.id, programLeadingWith(earlier.hand, 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    // (2,1) is nearer the antenna than (0,1), so that robot falls first and claims (0,2).
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(4), y: Integer(2) })
  })

  it('falls back to the nearest free tile when every reboot tile is taken', () => {
    const rebootTiles = [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }]
    const { game } = createGame(
      { x: Integer(1), y: Integer(1) }, rebootTiles, undefined,
      [{ x: Integer(2), y: Integer(1) }, { x: Integer(1), y: Integer(0) }],
    )
    const [fromEast, fromNorth] = [addTestPlayer(game), addTestPlayer(game)]
    fromEast.robot.turn(1) // NORTH -> WEST
    fromNorth.robot.turn(2) // NORTH -> SOUTH
    for (const each of game.players) {
      game.submitProgram(each.id, programLeadingWith(each.hand, 'MOVE_1').map((card) => card.id))._unsafeUnwrap()
    }

    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(2) })
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(4), y: Integer(2) })
    // Both reboot tiles are taken, so the nearest free tile to (0,2) wins; (0,1) is
    // free again because its own robot is the one falling.
    expect(resolveRobotAction(game).action.position).toEqual({ x: Integer(0), y: Integer(1) })
  })

  it('skips the antenna when choosing a fallback for an occupied reboot tile', () => {
    const { robot, player, cards: c, game } = createGame(
      { x: Integer(1), y: Integer(1) }, [{ x: Integer(2), y: Integer(1) }], undefined, [{ x: Integer(1), y: Integer(0) }],
    )
    const other = addTestPlayer(game)
    other.robot.turn(2) // NORTH -> SOUTH, facing the pit
    game.submitProgram(player.id, [c.MOVE_3, c.MOVE_1, c.TURN_LEFT, c.TURN_RIGHT, c.BACK_UP].map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(other.id, programLeadingWith(other.hand, 'MOVE_1').map((card) => card.id))._unsafeUnwrap()

    // (1,0) is nearer the antenna, so that robot falls first and claims the reboot tile.
    expect(resolveRobotAction(game).action).toMatchObject({
      robotId: other.robot.id, position: { x: Integer(2), y: Integer(1) },
    })

    const { action } = resolveRobotAction(game)
    expect(action.robotId).toBe(robot.id)
    expect(action.position).toEqual({ x: Integer(3), y: Integer(1) })
    expect(game.getRobotPosition(other.robot.id)).toEqual({ x: Integer(2), y: Integer(1) })
    expect(game.getRobotPosition(robot.id)).toEqual({ x: Integer(3), y: Integer(1) })
  })

  it.each([
    { rebootTile: { x: Integer(0), y: Integer(1) }, expectedProgress: 1 },
  ])('evaluates checkpoints at the reboot destination $rebootTile', ({ rebootTile, expectedProgress }) => {
    const board = createTestBoard([
      [new EmptyTile(), new EmptyTile([], 2), new PitTile()],
      [new EmptyTile(), new EmptyTile([], 1), new EmptyTile()],
      [new EmptyTile([], 3), new EmptyTile(), new EmptyTile()],
    ], { x: Integer(2), y: Integer(1), angle: Math.PI / 2 }, rebootTile)
    const instructions: Instruction[] = ['MOVE_3', 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'BACK_UP']
    const program = instructions.map((instruction, index) => new Card(`card-${index}`, instruction))
    const placement = createTestPlacement({ x: Integer(0), y: Integer(0) }, {
      direction: Direction.EAST, deck: new Deck(program),
    })
    const { player } = placement
    player.completeCheckpoint(1)
    const game = createTestGame({ board, players: [placement], deck: program })
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(rebootTile)
    expect(player.lastCheckpoint).toBe(expectedProgress)
    expect(player.robot.program).toEqual(program)
  })
})

describe('reboots reported in action results', () => {
  const moveCards = () => [
    new Card('move-3', 'MOVE_3'), new Card('move-1', 'MOVE_1'), new Card('left', 'TURN_LEFT'),
    new Card('right', 'TURN_RIGHT'), new Card('uturn', 'U_TURN'),
  ]

  // Regression: the reboot tile (13,2) is on the path, so the final position alone hides the fall.
  it('reports the fall when MOVE_3 crosses a reboot tile into a pit on Test Map', () => {
    const board = createBoard(boardMaps['test-map'])
    const cards = moveCards()
    const placement = createTestPlacement({ x: Integer(13), y: Integer(1) }, {
      id: 'robot', direction: Direction.SOUTH, deck: new Deck(cards),
    })
    const { player } = placement
    const game = createTestGame({ board, players: [placement], deck: cards })
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
    const board = createTestBoard(
      tiles,
      { x: Integer(0), y: Integer(0), angle: Math.PI / 2 },
      [{ x: Integer(0), y: Integer(2) }, { x: Integer(4), y: Integer(2) }],
    )
    const pusherCards = moveCards()
    const pushedCards = moveCards().map((card) => new Card(`pushed-${card.id}`, card.instruction))
    // The pusher at (0,1) is closer to the antenna (0,0), so it acts first.
    const pusherPlacement = createTestPlacement({ x: Integer(0), y: Integer(1) }, {
      id: 'pusher', direction: Direction.EAST, deck: new Deck(pusherCards),
    })
    const pushedPlacement = createTestPlacement({ x: Integer(1), y: Integer(1) }, {
      id: 'pushed', direction: Direction.NORTH, deck: new Deck(pushedCards),
    })
    const pusher = pusherPlacement.player
    const pushed = pushedPlacement.player
    const game = createTestGame({ board, players: [pusherPlacement, pushedPlacement], deck: [...pusherCards, ...pushedCards] })
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
    const board = createTestBoard(
      tiles,
      { x: Integer(0), y: Integer(0), angle: Math.PI / 2 },
      [{ x: Integer(1), y: Integer(1) }, { x: Integer(4), y: Integer(2) }],
    )
    const pusherCards = moveCards()
    const pushedCards = moveCards().map((card) => new Card(`pushed-${card.id}`, card.instruction))
    const pusherPlacement = createTestPlacement({ x: Integer(0), y: Integer(1) }, {
      id: 'pusher', direction: Direction.EAST, deck: new Deck(pusherCards),
    })
    const pushedPlacement = createTestPlacement({ x: Integer(1), y: Integer(1) }, {
      id: 'pushed', direction: Direction.NORTH, deck: new Deck(pushedCards),
    })
    const pusher = pusherPlacement.player
    const pushed = pushedPlacement.player
    const game = createTestGame({ board, players: [pusherPlacement, pushedPlacement], deck: [...pusherCards, ...pushedCards] })
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
