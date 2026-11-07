import { Integer } from '@/numbers'
import { submitProgramSchema } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { createDefaultGame } from '@/game/GameFactory'
import { boardMaps } from '@/game/boardMaps'
import { Direction, createGame, createPlayer } from '@/game/index'

describe('game factory', () => {
  it.each(['empty-map', 'test-map'] as const)('reboots at the configured destination after falling off %s', (mapName) => {
    const { game } = createGame(mapName)
    const player = game.addPlayer()._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(0), y: Integer(0) })
    game.submitProgram(player.id, [0, 4, 5, 3, 6].map((index) => player.hand[index].id))._unsafeUnwrap()

    expect(game.executeNextAction().action.position).toEqual(boardMaps[mapName].rebootTile)
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.board.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
  })

  it('uses the map reboot tile when a robot enters a test pit', () => {
    const { game } = createDefaultGame()
    const player = game.addPlayer()._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(5), y: Integer(11) })
    game.submitProgram(player.id, [0, 4, 5, 3, 6].map((index) => player.hand[index].id))._unsafeUnwrap()

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

  it('creates a fresh lobby game on the test map', () => {
    const first = createDefaultGame()
    const second = createDefaultGame()

    expect(first.gameId).not.toBe(second.gameId)
    expect(first.game.board.map?.name).toBe(boardMaps['test-map'].name)
    expect(first.game.board.antenna).toEqual(boardMaps['test-map'].antenna)
    expect(first.game.rebootTile).toEqual(boardMaps['test-map'].rebootTile)
    expect(first.game.players).toEqual([])
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
    expect(submitProgramSchema.parse({
      cardIds: cardIds.slice(0, 5),
    })).toMatchObject({ cardIds: cardIds.slice(0, 5) })
  })

    it('places an added player on the starting tile picked by the random source', () => {
    const { game } = createGame('test-map', undefined, () => 0.99)
    const player = game.addPlayer('#4d8deb')._unsafeUnwrap()

    expect(player.robot.colour).toBe('#4d8deb')
    expect(game.board.positionOf(player.robot.id)).toEqual({ x: 3, y: 7 })
    expect(game.startPositionOf(player.robot.id)).toEqual({ x: 3, y: 7 })
  })

  it('only picks starting tiles that are still free', () => {
    const { game } = createGame('test-map', undefined, () => 0)
    const positions = Array.from({ length: 3 }, () =>
      game.board.positionOf(game.addPlayer()._unsafeUnwrap().robot.id))

    expect(positions).toEqual([{ x: 8, y: 7 }, { x: 7, y: 7 }, { x: 6, y: 7 }])
  })

  it('gives six players six different starting tiles and has no tile for a seventh', () => {
    const { game } = createGame('test-map')
    const starts = Array.from({ length: 6 }, () =>
      game.startPositionOf(game.addPlayer()._unsafeUnwrap().robot.id))

    expect(new Set(starts.map(({ x, y }) => `${x},${y}`))).toEqual(
      new Set(boardMaps['test-map'].startTiles.map(([x, y]) => `${x},${y}`)),
    )
    expect(game.addPlayer()._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('remembers the starting tile after the robot moves and frees it when the player leaves', () => {
    const { game } = createGame('test-map', undefined, () => 0)
    const player = game.addPlayer()._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(1), y: Integer(5) })

    expect(game.startPositionOf(player.robot.id)).toEqual({ x: 8, y: 7 })

    game.removePlayer(player.id)
    expect(() => game.startPositionOf(player.robot.id)).toThrow()
    expect(game.board.positionOf(game.addPlayer()._unsafeUnwrap().robot.id)).toEqual({ x: 8, y: 7 })
  })

  it('creates isolated state for each game', () => {
    const first = createGame()
    const second = createGame()

    expect(first.game).not.toBe(second.game)
    expect(first.game.board).not.toBe(second.game.board)
  })
})
