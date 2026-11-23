import { resolveRobotAction } from '../../activationTestHelper.js'
import { Integer } from '@/numbers'
import { submitProgramSchema } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { createGame } from '@/domain/game/GameFactory'
import { boardMaps } from '@/domain/game/boardMaps'
import { Direction } from '@/domain/game/index'

describe('game factory', () => {
  it('includes both gear directions in the test map', () => {
    const game = createGame('test-map', 'Test game')
    expect(game.board.getTile({ x: Integer(9), y: Integer(6) })).toMatchObject({ kind: 'GEAR', rotation: 'CLOCKWISE' })
    expect(game.board.getTile({ x: Integer(11), y: Integer(8) })).toMatchObject({ kind: 'GEAR', rotation: 'COUNTERCLOCKWISE' })
  })

  it.each(['empty-map', 'test-map'] as const)('reboots at the configured destination after falling off %s', (mapName) => {
    const game = createGame(mapName, 'Test game')
    const player = game.addPlayer('red')._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(0), y: Integer(0) })
    game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(boardMaps[mapName].rebootTile)
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.board.occupantAt({ x: Integer(0), y: Integer(0) })).toBeUndefined()
  })

  it('uses the map reboot tile when a robot enters a test pit', () => {
    const game = createGame('test-map', 'Test game')
    const player = game.addPlayer('red')._unsafeUnwrap()
    game.board.relocateRobot(player.robot.id, { x: Integer(5), y: Integer(11) })
    game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(boardMaps['test-map'].rebootTile)
    expect(player.robot.direction).toBe(Direction.NORTH)
  })

  it('creates a programming-phase game on the map-sized board with no players', () => {
    const game = createGame('test-map', 'Test game')

    expect(game.players).toEqual([])
    expect(game.lastActivePhase).toBe('programming')
  })

  it('creates players with unique ids, a north-facing robot, and card ids the submit-program schema accepts', () => {
    const game = createGame('test-map', 'Test game')
    const first = game.addPlayer('red')._unsafeUnwrap()
    const second = game.addPlayer('blue')._unsafeUnwrap()
    const cardIds = first.hand.map((card) => card.id)

    expect(first.id).not.toBe(second.id)
    expect(first.robot.id).not.toBe(second.robot.id)
    expect(first.robot.direction).toBe(Direction.NORTH)
    expect(first.hand).toHaveLength(9)
    expect(new Set(cardIds).size).toBe(9)
    expect(submitProgramSchema.parse({
      cardIds: cardIds.slice(0, 5),
    })).toMatchObject({ cardIds: cardIds.slice(0, 5) })
  })

  it('only picks starting tiles that are still free', () => {
    const game = createGame('test-map', 'Test game')
    const positions = Array.from({ length: 3 }, () =>
      game.board.positionOf(game.addPlayer('red')._unsafeUnwrap().robot.id))
    expect(positions).toEqual([{ x: 8, y: 7 }, { x: 3, y: 8 }, { x: 10, y: 13 }])
  })

  it('gives six players six different starting tiles and has no tile for a seventh', () => {
    const game = createGame('test-map', 'Test game')
    const starts = Array.from({ length: 6 }, () =>
      game.board.positionOf(game.addPlayer('red')._unsafeUnwrap().robot.id))

    expect(new Set(starts.map(({ x, y }) => `${x},${y}`))).toEqual(
      new Set(boardMaps['test-map'].startTiles.map(([x, y]) => `${x},${y}`)),
    )
    expect(game.addPlayer('red')._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('frees the starting tile when the player leaves', () => {
    const game = createGame('test-map', 'Test game')
    const player = game.addPlayer('red')._unsafeUnwrap()

    game.removePlayer(player.id)
    expect(game.board.positionOf(game.addPlayer('red')._unsafeUnwrap().robot.id)).toEqual({ x: 8, y: 7 })
  })

  it('creates isolated state for each game', () => {
    const first = createGame('test-map', 'Test game')
    const second = createGame('test-map', 'Test game')

    expect(first).not.toBe(second)
    expect(first.board).not.toBe(second.board)
  })
})
