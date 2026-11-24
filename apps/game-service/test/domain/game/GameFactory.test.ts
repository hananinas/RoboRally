import { resolveRobotAction } from '../../activationTestHelper.js'
import { Integer } from '@/numbers'
import { submitProgramSchema } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { createGame } from '@/domain/game/GameFactory'
import { boardMaps, type BoardMapName } from '@/domain/game/boardMaps'
import { DECK_INSTRUCTIONS, Direction, Game, createBoard } from '@/domain/game/index'
import { addTestPlayer } from '../../fixtures.ts'

// A real map with its start tiles replaced, so a robot can begin where the test needs it.
function gameStartingAt(mapName: BoardMapName, start: readonly [x: number, y: number]): Game {
  return new Game({
    board: createBoard({ ...boardMaps[mapName], startTiles: [start] }),
    players: [],
    deck: DECK_INSTRUCTIONS,
    name: 'Test game',
  })
}

describe('game factory', () => {
  it('includes both gear directions in the test map', () => {
    const game = createGame('test-map', 'Test game')
    expect(game.board.getTile({ x: Integer(9), y: Integer(6) })).toMatchObject({ kind: 'GEAR', rotation: 'CLOCKWISE' })
    expect(game.board.getTile({ x: Integer(11), y: Integer(8) })).toMatchObject({ kind: 'GEAR', rotation: 'COUNTERCLOCKWISE' })
  })

  it.each([
    { mapName: 'empty-map', closest: { x: 3, y: 3 } },
    { mapName: 'test-map', closest: { x: 2, y: 6 } },
  ] as const)('reboots on the closest reboot tile after falling off $mapName', ({ mapName, closest }) => {
    const game = gameStartingAt(mapName, [0, 0])
    const player = addTestPlayer(game, 'red')
    game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual(closest)
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.getRobotPosition(player.robot.id)).toEqual(closest)
  })

  it('uses the closest map reboot tile when a robot enters a test pit', () => {
    const game = gameStartingAt('test-map', [5, 11])
    const player = addTestPlayer(game, 'red')
    game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(resolveRobotAction(game).action.position).toEqual({ x: 10, y: 10 })
    expect(player.robot.direction).toBe(Direction.NORTH)
  })

  it('creates a programming-phase game on the map-sized board with no players', () => {
    const game = createGame('test-map', 'Test game')

    expect(game.players).toEqual([])
    expect(game.lastActivePhase).toBe('programming')
  })

  it('creates players with unique ids, a north-facing robot, and card ids the submit-program schema accepts', () => {
    const game = createGame('test-map', 'Test game')
    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, 'blue')
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
      game.getRobotPosition(addTestPlayer(game, 'red').robot.id))
    expect(positions).toEqual([{ x: 8, y: 7 }, { x: 3, y: 8 }, { x: 10, y: 13 }])
  })

  it('gives six players six different starting tiles and has no tile for a seventh', () => {
    const game = createGame('test-map', 'Test game')
    const starts = Array.from({ length: 6 }, () =>
      game.getRobotPosition(addTestPlayer(game, 'red').robot.id))

    expect(new Set(starts.map(({ x, y }) => `${x},${y}`))).toEqual(
      new Set(boardMaps['test-map'].startTiles.map(([x, y]) => `${x},${y}`)),
    )
    expect(game.addPlayer('tank', 'red')._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('frees the starting tile when the player leaves', () => {
    const game = createGame('test-map', 'Test game')
    const player = addTestPlayer(game, 'red')

    game.removePlayer(player.id)
    expect(game.getRobotPosition(addTestPlayer(game, 'red').robot.id)).toEqual({ x: 8, y: 7 })
  })

  it('creates isolated state for each game', () => {
    const first = createGame('test-map', 'Test game')
    const second = createGame('test-map', 'Test game')

    expect(first).not.toBe(second)
    expect(first.board).not.toBe(second.board)
  })
})
