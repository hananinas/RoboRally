import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Card, Player, Robot } from './index.js'

function createGame() {
  const board = new Board([[new EmptyTile(), new EmptyTile()]])
  const robot = new Robot('robot-1', Direction.EAST)
  board.placeRobot(robot.id, { x: 0, y: 0 })
  const player = new Player('player-1', robot)
  const deck: Card[] = [
    new Card('move-1', 'MOVE_1'),
    new Card('left-1', 'TURN_LEFT'),
    new Card('move-2', 'MOVE_1'),
    new Card('left-2', 'TURN_LEFT'),
    new Card('move-3', 'MOVE_1'),
    new Card('left-3', 'TURN_LEFT'),
  ]
  const game = new Game(board, [player], deck)
  return { board, robot, player, deck, game }
}

describe('Game programming', () => {
  it('starts in programming and deals its card supply to the player', () => {
    const { board, robot, player, deck, game } = createGame()

    expect(game.board).toBe(board)
    expect(game.players).toEqual([player])
    expect(game.phase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(player.hand).toEqual(deck)
    expect(robot.program).toEqual([])

    deck.pop()
    expect(player.hand).toHaveLength(6)
  })

  it('preserves the selected order and enters activation after a valid submission', () => {
    const { robot, player, deck, game } = createGame()
    const program = [deck[5], deck[0], deck[3], deck[2], deck[1]]

    game.submitProgram(player.id, program)

    expect(robot.program).toEqual(program)
    expect(game.phase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(() => game.submitProgram(player.id, program)).toThrow()
  })

  it('rejects invalid submissions without changing the robot or game phase', () => {
    const { robot, player, deck, game } = createGame()
    const valid = deck.slice(0, 5)

    expect(() => game.submitProgram('unknown', valid)).toThrow()
    expect(() => game.submitProgram(player.id, deck.slice(0, 4))).toThrow(RangeError)
    expect(() => game.submitProgram(player.id, [deck[0], deck[0], ...deck.slice(1, 4)])).toThrow(RangeError)
    expect(() => game.submitProgram(player.id, [...deck.slice(0, 4), new Card('foreign', 'MOVE_1')])).toThrow()
    expect(() => game.submitProgram(player.id, [new Card(deck[0].id, 'MOVE_1'), ...deck.slice(1, 5)])).toThrow()

    expect(game.phase).toBe('programming')
    expect(robot.program).toEqual([])
    game.submitProgram(player.id, valid)
    expect(game.phase).toBe('activation')
  })

  it('requires one player and at least five distinct cards in V0', () => {
    const { board, player, deck } = createGame()
    expect(() => new Game(board, [], deck)).toThrow(RangeError)
    expect(() => new Game(board, [player, player], deck)).toThrow(RangeError)
    expect(() => new Game(board, [player], deck.slice(0, 4))).toThrow(RangeError)
    expect(() => new Game(board, [player], [deck[0], deck[0], ...deck.slice(1, 5)])).toThrow(RangeError)
  })
})
