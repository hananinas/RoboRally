import { parseSubmitProgram } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import {
  Direction,
  EmptyTile,
  Move1,
  TurnLeft,
  createSinglePlayerGame,
} from './index.js'

describe('single-player game', () => {
  it('creates the fixed board, player, and robot', () => {
    const { gameId, game, player } = createSinglePlayerGame()

    expect(gameId).toBe('00000000-0000-4000-8000-000000000001')
    expect(game.players).toEqual([player])
    expect(game.board.width).toBe(21)
    expect(game.board.height).toBe(15)
    expect(game.board.getTile({ x: 0, y: 0 })).toBeInstanceOf(EmptyTile)
    expect(game.board.getTile({ x: 20, y: 14 })).toBeInstanceOf(EmptyTile)
    expect(player.id).toBe('00000000-0000-4000-8000-000000000002')
    expect(player.robot.id).toBe('00000000-0000-4000-8000-000000000003')
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.board.positionOf(player.robot.id)).toEqual({ x: 10, y: 7 })
    expect(game.phase).toBe('programming')
  })

  it('deals nine distinct, contract-valid cards in a fixed order', () => {
    const { gameId, player } = createSinglePlayerGame()
    const cardIds = player.hand.map((card) => card.id)

    expect(player.hand).toHaveLength(9)
    expect(new Set(cardIds).size).toBe(9)
    expect(player.hand.map((card) => card.constructor)).toEqual([
      Move1,
      TurnLeft,
      Move1,
      TurnLeft,
      Move1,
      TurnLeft,
      Move1,
      TurnLeft,
      Move1,
    ])
    expect(parseSubmitProgram({ gameId, cardIds: cardIds.slice(0, 5) })).toEqual({
      gameId,
      cardIds: cardIds.slice(0, 5),
    })
  })

  it('creates isolated state for each service instance', () => {
    const first = createSinglePlayerGame()
    const second = createSinglePlayerGame()

    first.game.submitProgram(first.player.id, first.player.hand.slice(0, 5))

    expect(first.game).not.toBe(second.game)
    expect(first.game.board).not.toBe(second.game.board)
    expect(first.player.hand[0]).not.toBe(second.player.hand[0])
    expect(first.player.hand.map((card) => card.id)).toEqual(
      second.player.hand.map((card) => card.id),
    )
    expect(first.game.phase).toBe('activation')
    expect(second.game.phase).toBe('programming')
    expect(second.player.robot.program).toEqual([])
  })
})
