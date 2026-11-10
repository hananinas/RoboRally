import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, Game, PitTile, Player, Robot, type Tile } from '@/game/index'
import { Integer, PositiveInteger } from '@/numbers'

function createGame(pitWalls: readonly Direction[] = [], startWalls: readonly Direction[] = []) {
  const tiles: Tile[][] = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  tiles[1][0] = new EmptyTile(startWalls)
  tiles[1][1] = new PitTile(pitWalls)
  tiles[0][4] = new EmptyTile([], 1)
  tiles[2][3] = new EmptyTile([], 2)
  tiles[2][0] = new EmptyTile([], 3)
  const board = new Board(tiles, { x: Integer(4), y: Integer(1), angle: Math.PI / 2 })
  const robot = new Robot('robot', Direction.NORTH)
  const start = { x: Integer(0), y: Integer(1) }
  const pit = { x: Integer(1), y: Integer(1) }
  const reboot = { x: Integer(3), y: Integer(2) }
  board.placeRobot(robot.id, start)
  const player = new Player('player', robot)
  const program = [
    new Card('left', 'TURN_LEFT'),
    new Card('right', 'TURN_RIGHT'),
    new Card('uturn', 'U_TURN'),
    new Card('move', 'MOVE_1'),
    new Card('back', 'BACK_UP'),
  ]
  player.deck.add(program)
  const game = new Game({ board, players: [player], deck: program, rebootTile: reboot, random: () => 0 })
  return { board, robot, player, program, game, start, pit, reboot }
}

describe('shared gameplay movement', () => {
  it('reboots without a card program and stops remaining movement without starting a round', () => {
    const { board, robot, player, program, game, start, pit, reboot } = createGame()
    player.completeCheckpoint(1)

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual(reboot)
    expect(board.occupantAt(reboot)).toBe(robot.id)
    expect(board.occupantAt(start)).toBeUndefined()
    expect(board.occupantAt(pit)).toBeUndefined()
    expect(robot.direction).toBe(Direction.NORTH)
    expect(robot.program).toEqual([])
    expect(player.hand).toEqual(program)
    expect(player.lastCheckpoint).toBe(1)
    expect(game.phase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(game.hasStarted).toBe(false)
    expect(game.hasSubmittedProgram(player.id)).toBe(false)
  })

  it('continues across ordinary tiles when movement has no terminal entry effect', () => {
    const { board, robot, game } = createGame()
    board.relocateRobot(robot.id, { x: Integer(0), y: Integer(0) })

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual({ x: Integer(3), y: Integer(0) })
    expect(robot.direction).toBe(Direction.NORTH)
  })

  it('keeps successful steps when a multi-step move reaches the antenna', () => {
    const { board, robot, game } = createGame()
    const start = { x: Integer(2), y: Integer(1) }
    const destination = { x: Integer(3), y: Integer(1) }
    board.relocateRobot(robot.id, start)

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual(destination)
    expect(board.occupantAt(start)).toBeUndefined()
    expect(board.occupantAt(destination)).toBe(robot.id)
    expect(board.occupantAt(board.antenna)).toBeUndefined()
  })

  it.each([
    { wall: 'source', pitWalls: [], startWalls: [Direction.EAST] },
    { wall: 'destination', pitWalls: [Direction.WEST], startWalls: [] },
  ])('does not resolve pit entry when a $wall wall blocks movement', ({ pitWalls, startWalls }) => {
    const { board, robot, game, start, pit, reboot } = createGame(pitWalls, startWalls)

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual(start)
    expect(board.occupantAt(start)).toBe(robot.id)
    expect(board.occupantAt(pit)).toBeUndefined()
    expect(board.occupantAt(reboot)).toBeUndefined()
    expect(game.hasStarted).toBe(false)
  })

  it('uses the nearest safe tile and deterministic tie order when the reboot tile is occupied', () => {
    const { board, robot, game, pit, reboot } = createGame()
    const other = game.addPlayer()._unsafeUnwrap()
    board.relocateRobot(other.robot.id, reboot)
    const fallback = { x: Integer(3), y: Integer(1) }

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual(fallback)
    expect(board.positionOf(other.robot.id)).toEqual(reboot)
    expect(board.occupantAt(reboot)).toBe(other.robot.id)
    expect(board.occupantAt(fallback)).toBe(robot.id)
    expect(board.occupantAt(pit)).toBeUndefined()
    expect(robot.direction).toBe(Direction.NORTH)
    expect(game.hasSubmittedProgram(other.id)).toBe(false)
  })

  it.each(['walking', 'rebooting'] as const)('defers checkpoints reached by %s until the register completes', (movement) => {
    const { board, robot, player, program, game, reboot } = createGame()
    const initialProgress = movement === 'walking' ? 0 : 1
    const destination = movement === 'walking' ? { x: Integer(4), y: Integer(0) } : reboot
    if (movement === 'walking') {
      board.relocateRobot(robot.id, { x: Integer(3), y: Integer(0) })
    } else {
      player.completeCheckpoint(1)
    }

    game.moveRobot(robot, Direction.EAST, PositiveInteger(1))

    expect(board.positionOf(robot.id)).toEqual(destination)
    expect(player.lastCheckpoint).toBe(initialProgress)
    expect(game.currentRegister).toBe(0)
    expect(game.phase).toBe('programming')

    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()
    expect(player.lastCheckpoint).toBe(initialProgress)
    const { registerIndex, action } = game.executeNextAction()
    expect(registerIndex).toBe(0)
    expect(action.card.instruction).toBe('TURN_LEFT')
    expect(action.position).toEqual(destination)
    expect(player.lastCheckpoint).toBe(initialProgress + 1)
    expect(game.currentRegister).toBe(1)
  })

  it('preserves an accepted program while waiting for another player to submit', () => {
    const { board, robot, player, program, game, reboot } = createGame()
    const other = game.addPlayer()._unsafeUnwrap()
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual(reboot)
    expect(robot.program).toEqual(program)
    expect(player.hand).toEqual([])
    expect(robot.direction).toBe(Direction.NORTH)
    expect(player.lastCheckpoint).toBe(0)
    expect(game.hasStarted).toBe(true)
    expect(game.hasSubmittedProgram(player.id)).toBe(true)
    expect(game.hasSubmittedProgram(other.id)).toBe(false)
    expect(game.phase).toBe('programming')
    expect(game.currentRegister).toBe(0)
  })

  it('preserves the current activation register and leaves the next programmed action pending', () => {
    const { board, robot, player, program, game, reboot } = createGame()
    player.completeCheckpoint(1)
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()
    expect(game.executeNextAction().action.card).toBe(program[0])
    expect(game.currentRegister).toBe(1)

    game.moveRobot(robot, Direction.EAST, PositiveInteger(3))

    expect(board.positionOf(robot.id)).toEqual(reboot)
    expect(robot.direction).toBe(Direction.WEST)
    expect(robot.program).toEqual(program)
    expect(player.hand).toEqual([])
    expect(player.lastCheckpoint).toBe(1)
    expect(game.phase).toBe('activation')
    expect(game.currentRegister).toBe(1)
    expect(game.hasSubmittedProgram(player.id)).toBe(true)

    const { registerIndex, action } = game.executeNextAction()
    expect(registerIndex).toBe(1)
    expect(action.card).toBe(program[1])
    expect(action.position).toEqual(reboot)
    expect(action.direction).toBe(Direction.NORTH)
    expect(player.lastCheckpoint).toBe(2)
    expect(game.currentRegister).toBe(2)
  })
})
