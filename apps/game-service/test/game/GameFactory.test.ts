import { parseSubmitProgram } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { boardMaps } from '@/game/boardMaps'
import { Direction, createGame, createPlayer } from '@/game/index'

describe('game factory', () => {
  it('uses the map reboot tile when a robot enters a test pit', () => {
    const { game } = createGame('test-map')
    const player = createPlayer()
    game.addPlayer(player)
    game.board.relocateRobot(player.robot.id, { x: 5, y: 11 })
    game.submitProgram(player.id, [0, 4, 5, 3, 6].map((index) => player.hand[index]))

    expect(game.executeNextAction().action.position).toEqual(boardMaps['test-map'].rebootTile)
    expect(player.robot.direction).toBe(Direction.NORTH)
  })

  it('creates a programming-phase game on the map-sized board with no players', () => {
    const { gameId, game } = createGame()

    expect(gameId).toBe('00000000-0000-4000-8000-000000000001')
    expect(game.players).toEqual([])
    expect(game.board.width).toBe(boardMaps['test-map'].width)
    expect(game.board.height).toBe(boardMaps['test-map'].height)
    expect(game.phase).toBe('programming')
  })

  it('uses the antenna specified by the map', () => {
    const { game } = createGame()

    expect(game.board.antenna).toEqual(boardMaps['test-map'].antenna)
  })

  it('creates players with unique ids, a north-facing robot and nine cards in a fixed order', () => {
    const first = createPlayer()
    const second = createPlayer()
    const cardIds = first.hand.map((card) => card.id)

    expect(first.id).not.toBe(second.id)
    expect(first.robot.id).not.toBe(second.robot.id)
    expect(first.robot.direction).toBe(Direction.NORTH)
    expect(first.hand).toHaveLength(9)
    expect(new Set(cardIds).size).toBe(9)
    expect(first.hand.map((card) => card.instruction)).toEqual([
      'MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT',
      'TURN_RIGHT', 'U_TURN', 'MOVE_1', 'TURN_LEFT',
    ])
    expect(parseSubmitProgram({
      gameId: '00000000-0000-4000-8000-000000000001',
      playerId: first.id,
      cardIds: cardIds.slice(0, 5),
    })).toMatchObject({ playerId: first.id, cardIds: cardIds.slice(0, 5) })
  })

  it('places an added player at the centre of the board', () => {
    const { game } = createGame('empty-map')
    const player = createPlayer()

    expect(game.addPlayer(player)).toBe(true)
    expect(game.board.positionOf(player.robot.id)).toEqual({ x: 10, y: 7 })
  })

  it('creates isolated state for each game', () => {
    const first = createGame()
    const second = createGame()

    expect(first.game).not.toBe(second.game)
    expect(first.game.board).not.toBe(second.game.board)
  })
})
