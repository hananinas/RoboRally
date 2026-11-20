import { resolveRobotAction } from '../activationTestHelper.js'
import { Integer } from '@/numbers'
import { submitProgramSchema } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { createDefaultGame } from '@/game/GameFactory'
import { boardMaps } from '@/game/boardMaps'
import { Direction, createGame, createPlayer } from '@/game/index'

describe('game factory', () => {
  it('includes both gear directions in the test map', () => {
    const { game } = createGame('test-map')
    expect(game.board.getTile({ x: Integer(9), y: Integer(6) })).toMatchObject({ kind: 'GEAR', rotation: 'CLOCKWISE' })
    expect(game.board.getTile({ x: Integer(11), y: Integer(8) })).toMatchObject({ kind: 'GEAR', rotation: 'COUNTERCLOCKWISE' })
  })

  it.each(['empty-map', 'test-map'] as const)('reboots at the configured destination after falling off %s', (mapName) => {
    const { game } = createGame(mapName, undefined, () => 0)
    const player = game.addPlayer()._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(0), y: Integer(0) })
    game.submitProgram(player.id, [0, 1, 2, 3, 4].map((index) => player.hand[index].id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(boardMaps[mapName].rebootTile)
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.board.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
  })

  it('uses the map reboot tile when a robot enters a test pit', () => {
    const { game } = createDefaultGame(() => 0)
    const player = game.addPlayer()._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(5), y: Integer(11) })
    game.submitProgram(player.id, [0, 1, 2, 3, 4].map((index) => player.hand[index].id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(boardMaps['test-map'].rebootTile)
    expect(player.robot.direction).toBe(Direction.NORTH)
  })

  it('creates a programming-phase game on the map-sized board with no players', () => {
    const { gameId, game } = createGame()

    expect(gameId).toBe('00000000-0000-4000-8000-000000000001')
    expect(game.players).toEqual([])
    expect(game.board.width).toBe(boardMaps['test-map'].width)
    expect(game.board.height).toBe(boardMaps['test-map'].height)
    expect(game.lastActivePhase).toBe('programming')
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

  it('creates players with unique ids, a north-facing robot and a hand of nine drawn cards', () => {
    const first = createPlayer()
    const second = createPlayer()
    const cardIds = first.hand.map((card) => card.id)

    expect(first.id).not.toBe(second.id)
    expect(first.robot.id).not.toBe(second.robot.id)
    expect(first.robot.direction).toBe(Direction.NORTH)
    expect(first.hand).toHaveLength(9)
    expect(new Set(cardIds).size).toBe(9)
    expect(createPlayer(() => 0).hand.map((card) => card.instruction)).toEqual([
      'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_2', 'MOVE_2', 'MOVE_2', 'MOVE_3', 'BACK_UP',
    ])
    expect(submitProgramSchema.parse({
      cardIds: cardIds.slice(0, 5),
    })).toMatchObject({ cardIds: cardIds.slice(0, 5) })
  })

  it('places an added player on the starting tile picked by the random source', () => {
    const { game } = createGame('test-map', undefined, () => 0.99)
    const player = game.addPlayer('#4d8deb')._unsafeUnwrap()

    expect(player.robot.colour).toBe('#4d8deb')
    expect(game.board.positionOf(player.robot.id)).toEqual({ x: 5, y: 12 })
  })

  it('only picks starting tiles that are still free', () => {
    const { game } = createGame('test-map', undefined, () => 0)
    const positions = Array.from({ length: 3 }, () =>
      game.board.positionOf(game.addPlayer()._unsafeUnwrap().robot.id))
    expect(positions).toEqual([{ x: 8, y: 7 }, { x: 3, y: 8 }, { x: 10, y: 13 }])
  })

  it('gives six players six different starting tiles and has no tile for a seventh', () => {
    const { game } = createGame('test-map')
    const starts = Array.from({ length: 6 }, () =>
      game.board.positionOf(game.addPlayer()._unsafeUnwrap().robot.id))

    expect(new Set(starts.map(({ x, y }) => `${x},${y}`))).toEqual(
      new Set(boardMaps['test-map'].startTiles.map(([x, y]) => `${x},${y}`)),
    )
    expect(game.addPlayer()._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('frees the starting tile when the player leaves', () => {
    const { game } = createGame('test-map', undefined, () => 0)
    const player = game.addPlayer()._unsafeUnwrap()

    game.removePlayer(player.id)
    expect(game.board.positionOf(game.addPlayer()._unsafeUnwrap().robot.id)).toEqual({ x: 8, y: 7 })
  })

  it('creates isolated state for each game', () => {
    const first = createGame()
    const second = createGame()

    expect(first.game).not.toBe(second.game)
    expect(first.game.board).not.toBe(second.game.board)
  })
})
