import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, PitTile, type Tile } from '@/game/index'
import { Deck } from '@/game/Deck'
import { Integer } from '@/numbers'
import { addTestPlayer, createEmptyTileGrid, createTestGame, placeTestPlayer } from '../fixtures.ts'

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
  const board = new Board(tiles, { x: Integer(4), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(3), y: Integer(2) })
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
  const player = placeTestPlayer(board, start, { direction, deck: new Deck(program) })
  const robot = player.robot
  const game = createTestGame({ board, players: [player] })
  return { board, robot, player, program, game, start, pit, reboot }
}

describe('shared gameplay movement', () => {
  it('continues across ordinary tiles when movement has no terminal entry effect', () => {
    const { board, robot, player, program, game } = createGame([], [], Direction.EAST)
    board.relocateRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const move = program[3]
    game.submitProgram(player.id, [move, ...program.filter((card) => card !== move)].map((card) => card.id))._unsafeUnwrap()

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
    const move = program[3]
    game.submitProgram(player.id, [move, ...program.filter((card) => card !== move)].map((card) => card.id))._unsafeUnwrap()

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
    const move = program[3]
    game.submitProgram(player.id, [move, ...program.filter((card) => card !== move)].map((card) => card.id))._unsafeUnwrap()

    const result = game.executeNextAction()

    expect(result.action.position).toEqual(start)
    expect(board.occupantAt(start)).toBe(robot.id)
    expect(board.occupantAt(pit)).toBeUndefined()
    expect(board.occupantAt(reboot)).toBeUndefined()
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
})
