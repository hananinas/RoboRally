import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Move1, Player, Robot, TurnLeft } from '@/game/index.js'
import type { Card } from '@/game/index.js'

function createGame(deck: Card[]) {
  const board = new Board(Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => new EmptyTile()),
  ))
  const robot = new Robot('robot-1', Direction.EAST)
  board.placeRobot(robot.id, { x: 1, y: 1 })
  const player = new Player('player-1', robot)
  const game = new Game(board, [player], deck)
  return { board, robot, player, game }
}

describe('Game activation loop', () => {
  it('executes one action per call and returns to programming after five registers', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new TurnLeft(`left-${index}`))
    const { robot, player, game } = createGame(deck)
    expect(() => game.executeNextAction()).toThrow()
    game.submitProgram(player.id, deck)

    const directions = [
      Direction.NORTH,
      Direction.WEST,
      Direction.SOUTH,
      Direction.EAST,
      Direction.NORTH,
    ]
    for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
      const result = game.executeNextAction()
      expect(result).toEqual({
        registerIndex,
        action: {
          robotId: robot.id,
          card: deck[registerIndex],
          position: { x: 1, y: 1 },
          direction: directions[registerIndex],
        },
      })
      expect(game.currentRegister).toBe(registerIndex === 4 ? 0 : registerIndex + 1)
      expect(game.phase).toBe(registerIndex === 4 ? 'programming' : 'activation')
    }

    expect(robot.program).toEqual([])
    expect(player.hand).toEqual(deck)
    expect(() => game.executeNextAction()).toThrow()

    game.submitProgram(player.id, deck)
    expect(game.executeNextAction()).toMatchObject({ registerIndex: 0 })
    expect(robot.direction).toBe(Direction.WEST)
  })

  it('interprets Move1 through Board using the direction after a turn', () => {
    const deck: Card[] = [
      new TurnLeft('left-1'),
      new Move1('move-1'),
      new TurnLeft('left-2'),
      new TurnLeft('left-3'),
      new TurnLeft('left-4'),
    ]
    const { board, player, game } = createGame(deck)
    game.submitProgram(player.id, deck)

    game.executeNextAction()
    const result = game.executeNextAction()

    expect(result.action.position).toEqual({ x: 1, y: 0 })
    expect(board.positionOf('robot-1')).toEqual({ x: 1, y: 0 })
    expect(result.action.card).toBe(deck[1])
    expect(result.action.direction).toBe(Direction.NORTH)
    expect(game.executeNextAction().action.direction).toBe(Direction.WEST)
  })

  it('reports the position reached by Move1', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new Move1(`move-${index}`))
    const { board, player, game } = createGame(deck)
    game.submitProgram(player.id, deck)

    const result = game.executeNextAction()

    expect(result.action.position).toEqual({ x: 2, y: 1 })
    expect(board.positionOf('robot-1')).toEqual({ x: 2, y: 1 })
  })
})
