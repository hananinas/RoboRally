import { describe, expect, it } from 'vitest'
import { Board, Card, Deck, Direction, EmptyTile } from '@/game/index'
import { Integer } from '@/numbers'
import { createTestGame, placeTestPlayer, withRebootTiles } from '../fixtures.ts'

function createGame(count = 2) {
  const tiles = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  tiles[1][1] = new EmptyTile([], 1)
  tiles[2][2] = new EmptyTile([], 2)
  const board = new Board(withRebootTiles(tiles, { x: Integer(0), y: Integer(2) }), { x: Integer(0), y: Integer(0), angle: 0 })
  const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'TURN_LEFT'))
  const players = Array.from({ length: count }, (_, index) =>
    placeTestPlayer(board, { x: Integer(index + 1), y: Integer(1) }, { direction: Direction.NORTH, deck: new Deck(cards) }))
  const game = createTestGame({ board, players, deck: cards })
  for (const player of players) game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
  return { game, players, cards }
}

describe('environment execution', () => {
  it('finishes environment steps before advancing each register across two rounds', () => {
    const { game, players, cards } = createGame()
    for (let roundNumber = 1; roundNumber <= 2; roundNumber++) {
      if (roundNumber > 1) {
        for (const player of players) game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
      }
      for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
        for (const player of players) {
          const step = game.executeNextStep()
          expect(step.type).toBe('robot')
          if (step.type !== 'robot') throw new Error('Expected robot action')
          expect(step.result.action.robotId).toBe(player.robot.id)
          expect(step.result.registerIndex).toBe(registerIndex)
          expect(game.currentRegister).toBe(registerIndex)
        }
        expect(game.lastActivePhase).toBe('activation')
        expect(players[0].robot.program).toHaveLength(5)
        expect(game.hasPendingEnvironment).toBe(true)
        if (roundNumber === 1 && registerIndex === 0) expect(players[0].lastCheckpoint).toBe(0)
        expect(() => game.executeNextAction()).toThrow()
        expect(game.executeNextStep()).toEqual({
          type: 'environment', result: {
            kind: 'GEARS', roundConcluded: false,
            robots: [],
          },
        })
        expect(game.currentRegister).toBe(registerIndex)
        expect(game.lastActivePhase).toBe('activation')
        expect(players[0].robot.program).toHaveLength(5)
        expect(game.hasPendingEnvironment).toBe(true)
        expect(() => game.executeNextAction()).toThrow()
        expect(game.executeNextStep()).toEqual({
          type: 'environment', result: {
            kind: 'CHECKPOINTS', roundConcluded: registerIndex === 4,
            checkpointProgress: roundNumber === 1 && registerIndex === 0
              ? [{ playerId: players[0].id, lastCheckpoint: 1 }] : [],
          },
        })
        expect(game.currentRegister).toBe((registerIndex + 1) % 5)
      }
      expect(game.lastActivePhase).toBe('programming')
      expect(players.map((player) => player.robot.program)).toEqual([[], []])
      expect(() => game.executeNextStep()).toThrow()
    }
  })

  it.each(['ROBOTS', 'ENVIRONMENT'] as const)('preserves the %s stage across pause and resume', (stage) => {
    const { game, players } = createGame()
    if (stage === 'ENVIRONMENT') for (const _player of players) game.executeNextStep()
    const before = game.hasPendingEnvironment
    game.pause()
    expect(() => game.executeNextStep()).toThrow()
    expect(() => game.executeNextAction()).toThrow()
    expect(game.hasPendingEnvironment).toBe(before)
    expect(players[0].lastCheckpoint).toBe(0)
    game.resume()
    expect(game.executeNextStep().type).toBe(stage === 'ROBOTS' ? 'robot' : 'environment')
  })

  it.each(['ROBOTS', 'ENVIRONMENT'] as const)('cannot execute an aborted %s step', (stage) => {
    const { game, players } = createGame()
    if (stage === 'ENVIRONMENT') for (const _player of players) game.executeNextStep()
    const before = game.hasPendingEnvironment
    game.abort()
    game.resume()
    expect(() => game.executeNextStep()).toThrow()
    expect(() => game.executeNextAction()).toThrow()
    expect(game.hasPendingEnvironment).toBe(before)
    expect(players[0].lastCheckpoint).toBe(0)
  })

  it('leaves environment effects pending when the last eligible robot leaves', () => {
    const { game, players } = createGame()
    game.executeNextStep()
    game.removePlayer(players[1].id)
    const pending = game.hasPendingEnvironment
    expect(game.hasPendingEnvironment).toBe(true)
    expect(game.currentRegister).toBe(0)
    expect(players[0].lastCheckpoint).toBe(0)
    game.removePlayer(players[1].id)
    expect(game.hasPendingEnvironment).toBe(pending)
    game.executeNextStep()
    expect(game.currentRegister).toBe(0)
    const step = game.executeNextStep()
    expect(step.type).toBe('environment')
    if (step.type !== 'environment' || step.result.kind !== 'CHECKPOINTS') throw new Error('Expected checkpoint step')
    expect(step.result.checkpointProgress).toEqual([{ playerId: players[0].id, lastCheckpoint: 1 }])
    expect(game.currentRegister).toBe(1)
  })

  it('keeps the environment pending when an activated player leaves', () => {
    const { game, players } = createGame()
    game.executeNextStep()
    game.executeNextStep()
    const before = game.hasPendingEnvironment
    game.removePlayer(players[1].id)
    expect(game.hasPendingEnvironment).toBe(before)
    expect(players[0].lastCheckpoint).toBe(0)
    game.executeNextStep()
    expect(players[0].lastCheckpoint).toBe(0)
    game.executeNextStep()
    expect(players[0].lastCheckpoint).toBe(1)
  })

  it.each(['ROBOTS', 'ENVIRONMENT'] as const)('cancels pending %s work when the last member leaves', (stage) => {
    const { game, players } = createGame(1)
    if (stage === 'ENVIRONMENT') game.executeNextStep()
    game.removePlayer(players[0].id)
    expect(game.lastActivePhase).toBe('programming')
    expect(players[0].lastCheckpoint).toBe(0)
    expect(() => game.executeNextStep()).toThrow()
  })
})
