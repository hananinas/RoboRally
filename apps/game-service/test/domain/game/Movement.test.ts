import { resolveRobotAction } from '../../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import { Card, Direction, EmptyTile, PitTile, type Tile } from '@/domain/game/index'
import { Deck } from '@/domain/game/Deck'
import { Integer } from '@/numbers'
import { addTestPlayer, createEmptyTileGrid, createTestBoard, createTestGame, createTestPlacement, createTestRobot, programLeadingWith } from '../../fixtures.ts'

function createGame(
  pitWalls: readonly Direction[] = [],
  startWalls: readonly Direction[] = [],
  direction: Direction = Direction.NORTH,
) {
  const tiles: Tile[][] = createEmptyTileGrid(5, 3)
  tiles[1][0] = new EmptyTile(startWalls)
  tiles[1][1] = new PitTile(pitWalls)
  tiles[0][4] = new EmptyTile([], 1)
  tiles[2][3] = new EmptyTile([], 2)
  tiles[2][0] = new EmptyTile([], 3)
  const board = createTestBoard(tiles, { x: Integer(4), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(3), y: Integer(2) })
  const start = { x: Integer(0), y: Integer(1) }
  const pit = { x: Integer(1), y: Integer(1) }
  const reboot = { x: Integer(3), y: Integer(2) }
  const program = [
    new Card('left', 'TURN_LEFT'),
    new Card('right', 'TURN_RIGHT'),
    new Card('uturn', 'U_TURN'),
    new Card('move', 'MOVE_3'),
    new Card('back', 'BACK_UP'),
  ]
  const placement = createTestPlacement(start, { direction, deck: new Deck(program) })
  const { player } = placement
  const robot = player.robot
  const game = createTestGame({ board, players: [placement] })
  return { board, robot, player, program, game, start, pit, reboot }
}

describe('shared gameplay movement', () => {
  it('continues across ordinary tiles when movement has no terminal entry effect', () => {
    const { board, robot, player, program, game } = createGame([], [], Direction.EAST)
    board.relocateRobot(robot.id, { x: Integer(0), y: Integer(0) })
    game.submitProgram(player.id, programLeadingWith(program, 'MOVE_3').map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()

    expect(result.action.position).toEqual({ x: Integer(3), y: Integer(0) })
    expect(board.positionOf(robot.id)).toEqual({ x: Integer(3), y: Integer(0) })
    expect(robot.direction).toBe(Direction.EAST)
  })

  it('keeps successful steps when a multi-step move reaches the antenna', () => {
    const { board, robot, player, program, game } = createGame([], [], Direction.EAST)
    const start = { x: Integer(2), y: Integer(1) }
    const destination = { x: Integer(3), y: Integer(1) }
    board.relocateRobot(robot.id, start)
    game.submitProgram(player.id, programLeadingWith(program, 'MOVE_3').map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()

    expect(result.action.position).toEqual(destination)
    expect(board.occupantAt(start)).toBeUndefined()
    expect(board.occupantAt(destination)).toBe(robot.id)
    expect(board.occupantAt(board.antenna)).toBeUndefined()
  })

  it.each([
    { wall: 'source', pitWalls: [], startWalls: [Direction.EAST] },
    { wall: 'destination', pitWalls: [Direction.WEST], startWalls: [] },
  ])('does not resolve pit entry when a $wall wall blocks movement', ({ pitWalls, startWalls }) => {
    const { board, robot, player, program, game, start, pit, reboot } = createGame(pitWalls, startWalls, Direction.EAST)
    game.submitProgram(player.id, programLeadingWith(program, 'MOVE_3').map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()

    expect(result.action.position).toEqual(start)
    expect(board.occupantAt(start)).toBe(robot.id)
    expect(board.occupantAt(pit)).toBeUndefined()
    expect(board.occupantAt(reboot)).toBeUndefined()
  })

  it('uses the nearest safe tile and deterministic tie order when the reboot tile is occupied', () => {
    const { board, robot, player, program, game, pit, reboot } = createGame([], [], Direction.EAST)
    const other = createTestRobot()
    board.placeRobot(other.id, reboot)
    const fallback = { x: Integer(3), y: Integer(1) }
    game.submitProgram(player.id, programLeadingWith(program, 'MOVE_3').map((card) => card.id))._unsafeUnwrap()

    resolveRobotAction(game)

    expect(board.positionOf(robot.id)).toEqual(fallback)
    expect(board.positionOf(other.id)).toEqual(reboot)
    expect(board.occupantAt(reboot)).toBe(other.id)
    expect(board.occupantAt(fallback)).toBe(robot.id)
    expect(board.occupantAt(pit)).toBeUndefined()
    expect(robot.direction).toBe(Direction.EAST)
    expect(game.hasSubmittedProgram(other.id)).toBe(false)
  })

  it.each(['walking', 'rebooting'] as const)('defers checkpoints reached by %s until the register completes', (movement) => {
    const { board, robot, player, program, game, reboot } = createGame()
    const initialProgress = movement === 'walking' ? 0 : 1
    const destination = movement === 'walking' ? { x: Integer(4), y: Integer(0) } : reboot
    board.relocateRobot(robot.id, destination)
    if (movement === 'rebooting') player.completeCheckpoint(1)

    expect(board.positionOf(robot.id)).toEqual(destination)
    expect(player.lastCheckpoint).toBe(initialProgress)
    expect(game.currentRegister).toBe(0)
    expect(game.lastActivePhase).toBe('programming')

    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()
    expect(player.lastCheckpoint).toBe(initialProgress)
    const { registerIndex, action } = resolveRobotAction(game)
    expect(registerIndex).toBe(0)
    expect(action.card.instruction).toBe('TURN_LEFT')
    expect(action.position).toEqual(destination)
    expect(player.lastCheckpoint).toBe(initialProgress + 1)
    expect(game.currentRegister).toBe(1)
  })

  it('preserves an accepted program while waiting for another player to submit', () => {
    const { board, robot, player, program, game, start } = createGame()
    const other = addTestPlayer(game)
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    expect(board.positionOf(robot.id)).toEqual(start)
    expect(robot.program).toEqual(program)
    expect(player.hand).toEqual([])
    expect(robot.direction).toBe(Direction.NORTH)
    expect(player.lastCheckpoint).toBe(0)
    expect(game.hasSubmittedProgram(player.id)).toBe(true)
    expect(game.hasSubmittedProgram(other.id)).toBe(false)
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
  })

  it('still executes a pushed robot\'s own pending card after it reboots mid-register', () => {
    const tiles = [[new EmptyTile(), new EmptyTile(), new EmptyTile(), new PitTile(), new EmptyTile()]]
    const reboot = { x: Integer(4), y: Integer(0) }
    const board = createTestBoard(tiles, { x: Integer(0), y: Integer(0), angle: 0 }, reboot)
    const moverProgram = [
      new Card('mover-0', 'MOVE_1'),
      new Card('mover-1', 'TURN_LEFT'),
      new Card('mover-2', 'TURN_RIGHT'),
      new Card('mover-3', 'U_TURN'),
      new Card('mover-4', 'TURN_LEFT'),
    ]
    const bystanderProgram = [
      new Card('bystander-0', 'TURN_LEFT'),
      new Card('bystander-1', 'TURN_RIGHT'),
      new Card('bystander-2', 'U_TURN'),
      new Card('bystander-3', 'TURN_LEFT'),
      new Card('bystander-4', 'TURN_RIGHT'),
    ]
    const moverPlacement = createTestPlacement({ x: Integer(1), y: Integer(0) }, { direction: Direction.EAST, deck: new Deck(moverProgram) })
    const bystanderPlacement = createTestPlacement({ x: Integer(2), y: Integer(0) }, { direction: Direction.EAST, deck: new Deck(bystanderProgram) })
    const mover = moverPlacement.player
    const bystander = bystanderPlacement.player
    const game = createTestGame({ board, players: [moverPlacement, bystanderPlacement], deck: moverProgram })
    game.submitProgram(mover.id, moverProgram.map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(bystander.id, bystanderProgram.map((card) => card.id))._unsafeUnwrap()

    const pushResult = resolveRobotAction(game)
    expect(pushResult.pushedRobots).toEqual([{ robotId: bystander.robot.id, position: reboot, direction: Direction.EAST }])
    expect(board.positionOf(bystander.robot.id)).toEqual(reboot)

    const ownAction = resolveRobotAction(game)
    expect(ownAction.action.robotId).toBe(bystander.robot.id)
    expect(ownAction.action.card).toBe(bystanderProgram[0])
    expect(ownAction.action.position).toEqual(reboot)
    expect(game.currentRegister).toBe(1)
    expect(bystander.robot.program).toEqual(bystanderProgram)

    const register1Actions = [resolveRobotAction(game), resolveRobotAction(game)]
    const bystanderAction = register1Actions.find((result) => result.action.robotId === bystander.robot.id)
    expect(bystanderAction?.registerIndex).toBe(1)
    expect(bystanderAction?.action.card).toBe(bystanderProgram[1])
    expect(bystanderAction?.action.position).toEqual(reboot)
    expect(game.currentRegister).toBe(2)
  })
})
