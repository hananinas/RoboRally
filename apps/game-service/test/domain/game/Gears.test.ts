import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card, Deck, Direction, EmptyTile, GearTile, RobotPlacements, type Position, type Tile } from '@/domain/game/index'
import { Integer } from '@/numbers'
import { createTestBoard, createTestGame, createTestPlacement, createTestPlayer, createTestRobot, instructionsOf } from '../../fixtures.ts'

describe('gear tiles', () => {
  it.each(['CLOCKWISE', 'COUNTERCLOCKWISE'] as const)(
    'allows placement and movement through a %s gear without rotating on entry',
    (rotation) => {
      const gearPosition = { x: Integer(1), y: Integer(0) }
      const robot = createTestRobot({ direction: Direction.EAST })
      const placementBoard = createTestBoard([
        [new EmptyTile(), new GearTile(rotation), new EmptyTile()],
        [new EmptyTile(), new EmptyTile(), new EmptyTile()],
      ], { x: Integer(2), y: Integer(1), angle: 0 }, { x: Integer(0), y: Integer(1) })
      const placements = new RobotPlacements(placementBoard)
      placements.place(robot.id, gearPosition)
      expect(placements.positionOf(robot.id)).toEqual(gearPosition)
      expect(robot.direction).toBe(Direction.EAST)

      // Each check gets a fresh game so that an earlier register's end-of-register
      // gear rotation can't bleed into the next movement-entry check.
      function crossGear(instruction: Instruction, start: Position) {
        const board = createTestBoard([
          [new EmptyTile(), new GearTile(rotation), new EmptyTile()],
          [new EmptyTile(), new EmptyTile(), new EmptyTile()],
        ], { x: Integer(2), y: Integer(1), angle: 0 }, { x: Integer(0), y: Integer(1) })
        const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, instruction))
        const placement = createTestPlacement(start, { direction: Direction.EAST, deck: new Deck(cards) })
        const { player } = placement
        const game = createTestGame({ board, players: [placement], deck: instructionsOf(cards) })
        game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
        game.executeNextAction()
        return { game, robot: player.robot }
      }

      const onto = crossGear('MOVE_1', { x: Integer(0), y: Integer(0) })
      expect(onto.game.getRobotPosition(onto.robot.id)).toEqual(gearPosition)
      expect(onto.robot.direction).toBe(Direction.EAST)

      const through = crossGear('MOVE_2', { x: Integer(0), y: Integer(0) })
      expect(through.game.getRobotPosition(through.robot.id)).toEqual({ x: 2, y: 0 })
      expect(through.robot.direction).toBe(Direction.EAST)
    },
  )
})

function createGearGame(tiles: readonly Tile[], directions: readonly Direction[], instruction: Instruction = 'U_TURN') {
  const board = createTestBoard([
    tiles.map(() => new EmptyTile()),
    tiles,
    tiles.map(() => new EmptyTile()),
  ], { x: Integer(0), y: Integer(0), angle: 0 }, { x: Integer(0), y: Integer(2) })
  const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, instruction))
  const placements = directions.map((direction, index) =>
    createTestPlacement({ x: Integer(index), y: Integer(1) }, { direction, deck: new Deck(cards) }))
  const players = placements.map(({ player }) => player)
  const game = createTestGame({ board, players: placements, deck: instructionsOf(cards) })
  for (const player of players) game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
  return { game, players, cards }
}

describe('gear activation', () => {
  const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = Direction

  it.each([
    { rotation: 'CLOCKWISE', initialDirection: S, facing: N, expected: E },
    { rotation: 'CLOCKWISE', initialDirection: W, facing: E, expected: S },
    { rotation: 'CLOCKWISE', initialDirection: N, facing: S, expected: W },
    { rotation: 'CLOCKWISE', initialDirection: E, facing: W, expected: N },
    { rotation: 'COUNTERCLOCKWISE', initialDirection: S, facing: N, expected: W },
    { rotation: 'COUNTERCLOCKWISE', initialDirection: E, facing: W, expected: S },
    { rotation: 'COUNTERCLOCKWISE', initialDirection: N, facing: S, expected: E },
    { rotation: 'COUNTERCLOCKWISE', initialDirection: W, facing: E, expected: N },
  ] as const)('turns $rotation from $facing to $expected without moving', ({ rotation, initialDirection, facing, expected }) => {
    const { game, players } = createGearGame([new GearTile(rotation)], [initialDirection])
    const robot = players[0].robot
    game.executeNextStep()
    expect(robot.direction).toBe(facing)
    const position = game.getRobotPosition(robot.id)

    expect(game.executeNextStep()).toEqual({
      type: 'environment', result: {
        kind: 'GEARS', roundConcluded: false,
        robots: [{ robotId: robot.id, position, direction: expected }],
      },
    })
    expect(robot.direction).toBe(expected)
    expect(game.getRobotPosition(robot.id)).toEqual(position)
    game.executeNextStep() // Checkpoints must not rotate the robot again.
    expect(robot.direction).toBe(expected)
  })

  it('rotates every robot on a gear independently and leaves other robots unchanged', () => {
    const { game, players } = createGearGame([
      new GearTile('CLOCKWISE'), new GearTile('COUNTERCLOCKWISE'), new EmptyTile(), new GearTile('CLOCKWISE'),
    ], [N, N, N, E])
    for (const _player of players) game.executeNextStep()
    const positions = players.map(({ robot }) => game.getRobotPosition(robot.id))
    expect(players.map(({ robot }) => robot.direction)).toEqual([S, S, S, W])

    const step = game.executeNextStep()
    expect(step.type).toBe('environment')
    if (step.type !== 'environment' || step.result.kind !== 'GEARS') throw new Error('Expected gear step')
    expect(step.result.robots).toEqual([
      { robotId: players[0].robot.id, position: positions[0], direction: W },
      { robotId: players[1].robot.id, position: positions[1], direction: E },
      { robotId: players[3].robot.id, position: positions[3], direction: N },
    ])
    expect(players.map(({ robot }) => robot.direction)).toEqual([W, E, S, N])
    expect(players.map(({ robot }) => game.getRobotPosition(robot.id))).toEqual(positions)
  })

  it.each([
    { rotation: 'CLOCKWISE', expected: [W, S, E, N] },
    { rotation: 'COUNTERCLOCKWISE', expected: [E, S, W, N] },
  ] as const)('activates a $rotation gear once per register across rounds', ({ rotation, expected }) => {
    const { game, players, cards } = createGearGame([new GearTile(rotation)], [N])
    const player = players[0]
    for (let round = 0; round < 2; round++) {
      if (round > 0) game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
      for (let register = 0; register < 5; register++) {
        game.executeNextStep()
        game.executeNextStep()
        const direction = expected[(round * 5 + register) % 4]
        expect(player.robot.direction).toBe(direction)
        expect(game.getRobotPosition(player.robot.id)).toEqual({ x: 0, y: 1 })
        game.executeNextStep()
        expect(player.robot.direction).toBe(direction)
      }
    }
  })

  it.each([
    { instruction: 'MOVE_1', expectedX: 1, expectedDirection: S, changed: true },
    { instruction: 'MOVE_2', expectedX: 2, expectedDirection: E, changed: false },
  ] as const)('checks final occupancy after $instruction crosses a gear', ({ instruction, expectedX, expectedDirection, changed }) => {
    const { game, players } = createGearGame([
      new EmptyTile(), new GearTile('CLOCKWISE'), new EmptyTile(),
    ], [E], instruction)
    const robot = players[0].robot
    game.executeNextStep()
    expect(robot.direction).toBe(E)
    const step = game.executeNextStep()
    expect(step.type).toBe('environment')
    if (step.type !== 'environment' || step.result.kind !== 'GEARS') throw new Error('Expected gear step')
    expect(step.result.robots).toHaveLength(changed ? 1 : 0)
    expect(game.getRobotPosition(robot.id)).toEqual({ x: expectedX, y: 1 })
    expect(robot.direction).toBe(expectedDirection)
  })

  it.each([false, true])('resolves a push and both gear turns with reversed roster = %s', (reverse) => {
    const position = (x: number) => ({ x: Integer(x), y: Integer(1) })
    const board = createTestBoard([
      [new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile()],
      [new EmptyTile(), new GearTile('COUNTERCLOCKWISE', [N]), new GearTile('CLOCKWISE'), new EmptyTile()],
    ], { x: Integer(2), y: Integer(0), angle: 0 }, position(0))
    const cards = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    const pushed = createTestRobot({ direction: N })
    const pusher = createTestRobot({ direction: E })
    const placements = [{ robot: pushed, at: position(1) }, { robot: pusher, at: position(0) }].map(({ robot, at }) =>
      ({ player: createTestPlayer({ id: robot.id, robot, deck: new Deck(cards) }), position: at }))
    if (reverse) placements.reverse()
    const game = createTestGame({ board, players: placements, deck: instructionsOf(cards) })
    for (const { player } of placements) game.submitProgram(player.id, cards.map(({ id }) => id))._unsafeUnwrap()

    expect(game.executeNextStep()).toMatchObject({ type: 'robot', result: { action: { robotId: pushed.id } } })
    expect(game.executeNextStep()).toMatchObject({
      type: 'robot',
      result: {
        action: { robotId: pusher.id },
        pushedRobots: [{ robotId: pushed.id, position: position(2), direction: N }],
      },
    })
    expect([pushed.direction, pusher.direction]).toEqual([N, E])

    const step = game.executeNextStep()
    expect(step).toMatchObject({ type: 'environment', result: { kind: 'GEARS' } })
    if (step.type !== 'environment' || step.result.kind !== 'GEARS') throw new Error('Expected gear step')
    expect(new Map(step.result.robots.map(({ robotId, direction }) => [robotId, direction])))
      .toEqual(new Map([[pushed.id, E], [pusher.id, N]]))
    expect([pushed.direction, pusher.direction]).toEqual([E, N])
    expect(game.executeNextStep()).toMatchObject({ type: 'environment', result: { kind: 'CHECKPOINTS' } })
    expect(game.executeNextStep()).toMatchObject({
      type: 'robot',
      result: { registerIndex: 1, action: { robotId: pushed.id, position: position(3), direction: E } },
    })
  })

  it('preserves a completed gear step across pause and resume', () => {
    const { game, players } = createGearGame([new GearTile('CLOCKWISE')], [N])
    const robot = players[0].robot
    game.executeNextStep()
    game.executeNextStep()
    expect(robot.direction).toBe(W)
    const pending = game.hasPendingEnvironment
    game.pause()
    expect(() => game.executeNextStep()).toThrow()
    expect(game.hasPendingEnvironment).toBe(pending)
    game.resume()
    game.executeNextStep()
    expect(robot.direction).toBe(W)
    expect(game.currentRegister).toBe(1)
  })
})
