import { resolveRobotAction } from '../../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card, Direction, EmptyTile, PitTile, type Antenna, type Position, type Tile } from '@/domain/game/index'
import { Deck } from '@/domain/game/Deck'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestBoard, createTestGame, createTestPlacement, instructionsOf, programLeadingWith } from '../../fixtures.ts'

function position(x: number, y = 3): Position {
  return { x: Integer(x), y: Integer(y) }
}

function grid(): Tile[][] {
  return createEmptyTileGrid(9, 7)
}

function createGame(
  starts = [position(1), position(2), position(3)],
  tiles = grid(),
  antenna: Antenna = { ...position(0, 0), angle: 0 },
  reboot = position(0, 5),
) {
  const board = createTestBoard(tiles, antenna, reboot)
  const directions = [Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH]
  const instructions: Instruction[] = ['MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT', 'TURN_RIGHT', 'U_TURN', 'AGAIN']
  const cards = instructions.map((instruction) => new Card(instruction, instruction))
  const placements = starts.map((start, index) =>
    createTestPlacement(start, { direction: directions[index % directions.length], deck: new Deck(cards) }))
  const players = placements.map(({ player }) => player)
  const game = createTestGame({ board, players: placements, deck: instructionsOf(cards) })
  return { players, robots: players.map((player) => player.robot), cards, game, reboot }
}

describe('robot pushing', () => {
  it('captures final pushed positions after every step and reboot, independently of later movement', () => {
    const tiles = grid()
    tiles[3][8] = new PitTile()
    const { robots, players, cards, game, reboot } = createGame([position(5), position(6), position(7)], tiles)
    const program = programLeadingWith(cards, 'MOVE_2')
    for (const player of players) game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    const result = resolveRobotAction(game)
    const expected = [
      { robotId: robots[1].id, position: position(0, 4), direction: Direction.NORTH },
      { robotId: robots[2].id, position: reboot, direction: Direction.WEST },
    ]
    expect(result.pushedRobots).toEqual(expected)
    expect(result.registers[0]).toEqual({ status: 'REVEALED', instruction: program[0].instruction })
    expect(players[0].registers).toEqual(result.registers)
    for (const player of players.slice(1)) {
      expect(player.registers).toEqual(Array.from({ length: 5 }, () => ({ status: 'HIDDEN' })))
    }
    game.executeNextAction()
    expect(result.pushedRobots).toEqual(expected)
  })

  it.each([
    { direction: Direction.NORTH, starts: [position(4, 4), position(4, 3), position(4, 2)], ends: [position(4, 3), position(4, 2), position(4, 1)] },
    { direction: Direction.EAST, starts: [position(1), position(2), position(3)], ends: [position(2), position(3), position(4)] },
    { direction: Direction.SOUTH, starts: [position(4, 2), position(4, 3), position(4, 4)], ends: [position(4, 3), position(4, 4), position(4, 5)] },
    { direction: Direction.WEST, starts: [position(5), position(4), position(3)], ends: [position(4), position(3), position(2)] },
  ])('pushes a chain $direction and preserves all facing directions', ({ direction, starts, ends }) => {
    const { robots, players, cards, game } = createGame(starts)
    robots[0].turn([Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH].indexOf(direction))
    const facing = robots.map((robot) => robot.direction)
    const moveProgram = programLeadingWith(cards, 'MOVE_1')
    const waitProgram = programLeadingWith(cards, 'AGAIN')
    game.submitProgram(players[0].id, moveProgram.map((card) => card.id))._unsafeUnwrap()
    for (const player of players.slice(1)) game.submitProgram(player.id, waitProgram.map((card) => card.id))._unsafeUnwrap()

    // Priority (distance to antenna) can put a waiting robot's no-op AGAIN ahead of robots[0]'s move.
    let action = game.executeNextAction().action
    while (action.robotId !== robots[0].id) action = game.executeNextAction().action

    expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual(ends)
    expect(robots.map((robot) => robot.direction)).toEqual(facing)
  })

  it.each([0, 1, 2, 3])('rejects the entire chain when boundary %s has a wall on either side', (boundary) => {
    for (const side of ['source', 'destination'] as const) {
      const tiles = grid()
      const x = 1 + boundary + (side === 'destination' ? 1 : 0)
      tiles[3][x] = new EmptyTile([side === 'source' ? Direction.EAST : Direction.WEST])
      const starts = [position(1), position(2), position(3), position(4)]
      const { robots, players, cards, game } = createGame(starts, tiles)
      const moveProgram = programLeadingWith(cards, 'MOVE_1')
      game.submitProgram(players[0].id, moveProgram.map((card) => card.id))._unsafeUnwrap()
      for (const player of players.slice(1)) game.submitProgram(player.id, cards.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

      expect(game.executeNextAction().action.robotId).toBe(robots[0].id)

      expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual(starts)
    }
  })

  it('rejects the entire chain when its destination is the priority antenna', () => {
    const starts = [position(1), position(2), position(3)]
    const { robots, players, cards, game } = createGame(starts, grid(), { ...position(4), angle: 0 })
    const moveProgram = programLeadingWith(cards, 'MOVE_1')
    const waitProgram = programLeadingWith(cards, 'AGAIN')
    game.submitProgram(players[0].id, moveProgram.map((card) => card.id))._unsafeUnwrap()
    for (const player of players.slice(1)) game.submitProgram(player.id, waitProgram.map((card) => card.id))._unsafeUnwrap()

    let action = game.executeNextAction().action
    while (action.robotId !== robots[0].id) action = game.executeNextAction().action

    expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual(starts)
  })

  it('keeps successful steps when a later push is blocked', () => {
    const tiles = grid()
    tiles[3][5] = new EmptyTile([Direction.EAST])
    const { robots, players, cards, game } = createGame(undefined, tiles)
    const moveProgram = programLeadingWith(cards, 'MOVE_3')
    game.submitProgram(players[0].id, moveProgram.map((card) => card.id))._unsafeUnwrap()
    for (const player of players.slice(1)) game.submitProgram(player.id, cards.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(robots[0].id)

    expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual([position(3), position(4), position(5)])
  })

  it.each([
    { instruction: 'MOVE_1', steps: 1 },
    { instruction: 'MOVE_2', steps: 2 },
    { instruction: 'MOVE_3', steps: 3 },
    { instruction: 'BACK_UP', steps: 1 },
  ] as const)('pushes using $instruction without consuming another robot\'s action', ({ instruction, steps }) => {
    const { robots, players, cards, game } = createGame()
    if (instruction === 'BACK_UP') robots[0].turn(2)
    const facing = robots.map((robot) => robot.direction)
    const program = programLeadingWith(cards, instruction)
    for (const player of players) game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.robotId).toBe(robots[0].id)

    expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual([position(1 + steps), position(2 + steps), position(3 + steps)])
    expect(robots.map((robot) => robot.direction)).toEqual(facing)
    expect(robots.map((robot) => robot.program)).toEqual(players.map(() => program))
    expect(game.currentRegister).toBe(0)
    expect(resolveRobotAction(game).action).toMatchObject({
      robotId: robots[1].id,
      position: position(2 + steps, instruction === 'BACK_UP' ? 4 : 3 - steps),
      direction: Direction.NORTH,
    })
    expect(resolveRobotAction(game).action.robotId).toBe(robots[2].id)
    expect(game.currentRegister).toBe(1)
  })

  it.each(['pit', 'edge'] as const)('reboots the farthest robot pushed into a %s and continues the movement card', (hazard) => {
    const tiles = grid()
    if (hazard === 'pit') tiles[3][8] = new PitTile()
    const starts = hazard === 'pit'
      ? [position(5), position(6), position(7)]
      : [position(6), position(7), position(8)]
    const { robots, players, cards, reboot, game } = createGame(starts, tiles)
    const moveProgram = programLeadingWith(cards, 'MOVE_2')
    game.submitProgram(players[0].id, moveProgram.map((card) => card.id))._unsafeUnwrap()
    for (const player of players.slice(1)) game.submitProgram(player.id, cards.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(robots[0].id)

    expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual([
      position(starts[0].x + 2), position(0, 4), reboot,
    ])
    expect(robots.map((robot) => robot.direction)).toEqual([Direction.EAST, Direction.NORTH, Direction.WEST])
  })

  it('does not trigger a pit reboot through a wall at the end of the chain', () => {
    const tiles = grid()
    tiles[3][4] = new PitTile([Direction.WEST])
    const starts = [position(1), position(2), position(3)]
    const { robots, players, cards, game } = createGame(starts, tiles)
    const moveProgram = programLeadingWith(cards, 'MOVE_1')
    game.submitProgram(players[0].id, moveProgram.map((card) => card.id))._unsafeUnwrap()
    for (const player of players.slice(1)) game.submitProgram(player.id, cards.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(game.executeNextAction().action.robotId).toBe(robots[0].id)

    expect(robots.map((robot) => game.getRobotPosition(robot.id))).toEqual(starts)
  })

  it('executes a pushed robot\'s pending card from its reboot destination', () => {
    const tiles = grid()
    tiles[3][3] = new PitTile()
    const { players, robots, cards, reboot, game } = createGame([position(1), position(2)], tiles)
    const program = cards.slice(0, 5)
    for (const player of players) game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.robotId).toBe(robots[0].id)
    expect(game.getRobotPosition(robots[1].id)).toEqual(reboot)
    expect(robots[1].program).toEqual(program)
    expect(game.currentRegister).toBe(0)
    expect(resolveRobotAction(game).action).toMatchObject({
      robotId: robots[1].id, card: program[0], position: position(0, 4), direction: Direction.NORTH,
    })
    expect(game.currentRegister).toBe(1)
  })

  it('can push a robot again immediately after it has rebooted', () => {
    const tiles = grid()
    tiles[3][3] = new PitTile()
    const board = createTestBoard(tiles, { x: Integer(0), y: Integer(0), angle: 0 }, position(2))
    const moverDeck = [
      new Card('move-a', 'MOVE_1'),
      new Card('turn', 'TURN_LEFT'),
      new Card('move-b', 'MOVE_1'),
      new Card('filler-a', 'TURN_RIGHT'),
      new Card('filler-b', 'U_TURN'),
    ]
    const moverPlacement = createTestPlacement(position(1), { direction: Direction.EAST, deck: new Deck(moverDeck) })
    const mover = moverPlacement.player
    const bystanderDeck = [
      new Card('wait-a', 'AGAIN'),
      new Card('wait-b', 'AGAIN'),
      new Card('wait-c', 'AGAIN'),
      new Card('filler-c', 'TURN_RIGHT'),
      new Card('filler-d', 'U_TURN'),
    ]
    const bystanderPlacement = createTestPlacement(position(2), { direction: Direction.NORTH, deck: new Deck(bystanderDeck) })
    const bystander = bystanderPlacement.player
    const game = createTestGame({ board, players: [moverPlacement, bystanderPlacement] })
    game.submitProgram(mover.id, moverDeck.map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(bystander.id, bystanderDeck.map((card) => card.id))._unsafeUnwrap()

    resolveRobotAction(game)
    resolveRobotAction(game)
    expect(game.getRobotPosition(mover.robot.id)).toEqual(position(2))
    expect(game.getRobotPosition(bystander.robot.id)).toEqual(position(2, 2))

    resolveRobotAction(game)
    resolveRobotAction(game)
    resolveRobotAction(game)
    resolveRobotAction(game)

    expect(game.getRobotPosition(mover.robot.id)).toEqual(position(2, 2))
    expect(game.getRobotPosition(bystander.robot.id)).toEqual(position(2, 1))
    expect(bystander.robot.direction).toBe(Direction.NORTH)
  })

  it('can push a robot that already acted without activating it again', () => {
    const { robots, players, cards, game } = createGame([position(2), position(3)])
    const turnsFirst = programLeadingWith(cards, 'TURN_LEFT')
    const movesFirst = cards.slice(0, 5)
    robots[1].turn(1)
    game.submitProgram(players[0].id, turnsFirst.map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(players[1].id, movesFirst.map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.robotId).toBe(robots[0].id)
    expect(resolveRobotAction(game).action.robotId).toBe(robots[1].id)

    expect(game.getRobotPosition(robots[0].id)).toEqual(position(1))
    expect(game.getRobotPosition(robots[1].id)).toEqual(position(2))
    expect(robots[0].direction).toBe(Direction.NORTH)
    expect(robots[1].direction).toBe(Direction.WEST)
    expect(game.currentRegister).toBe(1)
  })

  it('awards a pushed robot its checkpoint only when the register finishes', () => {
    const tiles = grid()
    tiles[3][3] = new EmptyTile([], 1)
    tiles[6][8] = new EmptyTile([], 2)
    const { players, cards, game } = createGame([position(1), position(2)], tiles)
    const turnsFirst = programLeadingWith(cards, 'TURN_LEFT')
    game.submitProgram(players[0].id, cards.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(players[1].id, turnsFirst.map((card) => card.id))._unsafeUnwrap()

    resolveRobotAction(game)
    expect(game.getRobotPosition(players[1].robot.id)).toEqual(position(3))
    expect(players[1].lastCheckpoint).toBe(0)
    resolveRobotAction(game)
    expect(players[1].lastCheckpoint).toBe(1)
    expect(game.currentRegister).toBe(1)
  })
})
