import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Card, Deck, Direction, EmptyTile, GearTile } from '@/domain/game/index'
import { createActionScheduler, type ActionScheduler } from '@/socket/gameSession/actionScheduler'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import { createSessionStore } from '@/auth/sessionStore'
import { Integer } from '@/numbers'
import { createTestBoard, createTestGame, createTestPlayer, createTestRobot, instructionsOf } from './fixtures.ts'

describe('activation scheduler', () => {
  let io: GameSocketServer
  let scheduler: ActionScheduler

  beforeEach(() => vi.useFakeTimers({ toFake: ['setImmediate', 'clearImmediate'] }))
  afterEach(() => {
    scheduler.stop()
    void io.close()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function createGame(onGear = false) {
    const board = createTestBoard([
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
      [new GearTile('CLOCKWISE'), new EmptyTile([], 1), new EmptyTile()],
      [new EmptyTile(), new EmptyTile([], 2), new EmptyTile()],
    ], { x: Integer(0), y: Integer(0), angle: 0 }, { x: Integer(2), y: Integer(0) })
    const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'TURN_LEFT'))
    const robot = createTestRobot({ direction: Direction.NORTH })
    const player = createTestPlayer({ id: 'player', robot, deck: new Deck(cards) })
    const position = { x: Integer(onGear ? 0 : 1), y: Integer(1) }
    const game = createTestGame({ board, players: [{ player, position }], deck: instructionsOf(cards) })
    game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
    io = createGameSocketServer(createServer(), createSessionStore({ oidcClient: { refreshToken: vi.fn() }, refreshBufferSeconds: 0 }))
    const broadcast = vi.spyOn(io.of('/').adapter, 'broadcast')
    scheduler = createActionScheduler({ io, game, publicRoom: 'public', playerRoom: (id) => `private:${id}`, onWinnerDeclared: vi.fn(),
      onProgrammingStarted: vi.fn(), onStop: vi.fn() })
    const events = () => broadcast.mock.calls.map(([packet, options]) => ({
      name: packet.data[0], payload: packet.data[1], rooms: [...options.rooms],
    }))
    return { game, board, player, events }
  }

  it('rechecks pause inside queued callbacks and resumes without duplicate steps or hands', () => {
    const { game, player, events } = createGame()
    scheduler.scheduleNextAction()
    scheduler.scheduleNextAction()
    game.pause()
    vi.runAllTimers()
    expect(events()).toEqual([])
    expect(game.hasPendingEnvironment).toBe(false)

    game.resume()
    scheduler.scheduleNextAction()
    scheduler.scheduleNextAction()
    vi.advanceTimersToNextTimer()
    expect(events().map((event) => event.name)).toEqual(['robot.actionResolved'])
    expect(game.hasPendingEnvironment).toBe(true)
    game.pause()
    vi.runAllTimers()
    expect(player.lastCheckpoint).toBe(0)
    expect(events()).toHaveLength(1)

    game.resume()
    scheduler.scheduleNextAction()
    scheduler.scheduleNextAction()
    vi.runAllTimers()
    expect(events().map((event) => event.name)).toEqual([
      'robot.actionResolved', 'environment.stepResolved',
      ...Array.from({ length: 4 }, () => 'robot.actionResolved'), 'cards.dealt',
    ])
    expect(events().filter((event) => event.name === 'environment.stepResolved').map((event) => event.payload.kind))
      .toEqual(['CHECKPOINTS'])
    expect(events().at(-1)?.rooms).toEqual(['private:player'])
    scheduler.scheduleNextAction()
    vi.runAllTimers()
    expect(events()).toHaveLength(7)
  })

  it('broadcasts gear changes before the next action and deals after the last register', () => {
    const { game, player, events } = createGame(true)
    scheduler.scheduleNextAction()
    vi.runAllTimers()
    expect(events().map(({ name }) => name)).toEqual([
      ...Array.from({ length: 5 }, () => ['robot.actionResolved', 'environment.stepResolved']).flat(),
      'cards.dealt',
    ])
    expect(events().filter(({ name }) => name === 'environment.stepResolved').map(({ payload }) => payload.kind))
      .toEqual(Array.from({ length: 5 }, () => 'GEARS'))
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.lastActivePhase).toBe('programming')
  })

  it.each(['abort', 'stop'] as const)('does not execute an already queued callback after %s', (action) => {
    const { game, events } = createGame()
    scheduler.scheduleNextAction()
    if (action === 'abort') game.abort()
    else scheduler.stop()
    vi.runAllTimers()
    expect(events()).toEqual([])
  })

  it('aborts on an environment failure without publishing a result or dealing hands', () => {
    const { game, board, events } = createGame()
    scheduler.scheduleNextAction()
    vi.advanceTimersToNextTimer()
    const before = game.hasPendingEnvironment
    vi.spyOn(board, 'getTile').mockImplementationOnce(() => { throw new Error('Environment failed') })
    vi.runAllTimers()
    expect(game.aborted).toBe(true)
    expect(game.hasPendingEnvironment).toBe(before)
    expect(events().map((event) => event.name)).toEqual(['robot.actionResolved', 'game.aborted'])
    game.resume()
    scheduler.scheduleNextAction()
    vi.runAllTimers()
    expect(events()).toHaveLength(2)
  })

  it('cancels queued environment work when the last member leaves', () => {
    const { game, player, events } = createGame()
    scheduler.scheduleNextAction()
    vi.advanceTimersToNextTimer()
    expect(game.hasPendingEnvironment).toBe(true)
    game.removePlayer(player.id)
    vi.runAllTimers()
    expect(events().map((event) => event.name)).toEqual(['robot.actionResolved'])
    expect(player.lastCheckpoint).toBe(0)
  })
})
