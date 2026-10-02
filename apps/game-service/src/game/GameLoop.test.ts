import { describe, expect, it, vi } from 'vitest'
import { Board, Direction, EmptyTile, Game, Move1, Player, Robot, TurnLeft } from './index.js'
import type { Card } from './index.js'

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
  it('executes one register per call and returns to programming after five', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new TurnLeft(`left-${index}`))
    const { robot, player, game } = createGame(deck)
    expect(() => game.executeCurrentRegister()).toThrow()
    game.submitProgram(player.id, deck)

    const directions = [
      Direction.NORTH,
      Direction.WEST,
      Direction.SOUTH,
      Direction.EAST,
      Direction.NORTH,
    ]
    for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
      const result = game.executeCurrentRegister()
      expect(result).toEqual({
        registerIndex,
        phase: registerIndex === 4 ? 'programming' : 'activation',
        actions: [{
          robotId: robot.id,
          card: deck[registerIndex],
          position: { x: 1, y: 1 },
          direction: directions[registerIndex],
        }],
      })
      expect(game.currentRegister).toBe(registerIndex === 4 ? 0 : registerIndex + 1)
    }

    expect(robot.program).toEqual([])
    expect(player.hand).toEqual(deck)
    expect(() => game.executeCurrentRegister()).toThrow()

    game.submitProgram(player.id, deck)
    expect(game.executeCurrentRegister().registerIndex).toBe(0)
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
    const move = vi.spyOn(board, 'moveRobot')
    game.submitProgram(player.id, deck)

    game.executeCurrentRegister()
    const result = game.executeCurrentRegister()

    expect(move).toHaveBeenCalledExactlyOnceWith('robot-1', Direction.NORTH, 1)
    expect(result.actions[0].card).toBe(deck[1])
    expect(result.actions[0].direction).toBe(Direction.NORTH)
    expect(game.executeCurrentRegister().actions[0].card).toBe(deck[2])
  })

  it('reports the position reached by Move1', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new Move1(`move-${index}`))
    const { board, player, game } = createGame(deck)
    game.submitProgram(player.id, deck)

    const result = game.executeCurrentRegister()

    expect(result.actions[0].position).toEqual({ x: 2, y: 1 })
    expect(board.positionOf('robot-1')).toEqual({ x: 2, y: 1 })
  })
})
