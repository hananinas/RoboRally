import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, Game, Player, Robot } from '@/game/index'
import { Integer } from '@/numbers'

function createGame(count = 2) {
  const tiles = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  tiles[1][1] = new EmptyTile([], 1)
  const board = new Board(tiles, { x: Integer(0), y: Integer(0), angle: 0 })
  const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'TURN_LEFT'))
  const players = Array.from({ length: count }, (_, index) => {
    const robot = new Robot(`robot-${index}`, Direction.NORTH)
    board.placeRobot(robot.id, { x: Integer(index + 1), y: Integer(1) })
    return new Player(`player-${index}`, robot)
  })
  const game = new Game(board, players, cards, { x: Integer(0), y: Integer(2) })
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
        expect(game.phase).toBe('activation')
        expect(players[0].robot.program).toHaveLength(5)
        expect(game.executionState.activation).toEqual({
          stage: 'ENVIRONMENT', registerIndex, stepIndex: 0, kind: 'GEARS',
        })
        if (roundNumber === 1 && registerIndex === 0) expect(players[0].lastCheckpoint).toBe(0)
        expect(() => game.executeNextAction()).toThrow('Environment steps must finish')
        expect(game.executeNextStep()).toEqual({
          type: 'environment', result: {
            roundNumber, registerIndex, stepIndex: 0, kind: 'GEARS',
            sequence: (roundNumber - 1) * 10 + registerIndex * 2 + 1, robots: [], checkpointProgress: [],
          },
        })
        expect(game.currentRegister).toBe(registerIndex)
        expect(game.phase).toBe('activation')
        expect(players[0].robot.program).toHaveLength(5)
        expect(game.executionState.activation).toEqual({
          stage: 'ENVIRONMENT', registerIndex, stepIndex: 1, kind: 'CHECKPOINTS',
        })
        expect(() => game.executeNextAction()).toThrow('Environment steps must finish')
        expect(game.executeNextStep()).toEqual({
          type: 'environment', result: {
            roundNumber, registerIndex, stepIndex: 1, kind: 'CHECKPOINTS',
            sequence: (roundNumber - 1) * 10 + registerIndex * 2 + 2, robots: [],
            checkpointProgress: roundNumber === 1 && registerIndex === 0
              ? [{ playerId: players[0].id, lastCheckpoint: 1 }] : [],
          },
        })
        expect(game.currentRegister).toBe((registerIndex + 1) % 5)
      }
      expect(game.phase).toBe('programming')
      expect(game.executionState).toEqual({ roundNumber: roundNumber + 1, lastEnvironmentSequence: roundNumber * 10, activation: null })
      expect(players.map((player) => player.robot.program)).toEqual([[], []])
      expect(() => game.executeNextStep()).toThrow('activation')
    }
  })

  it.each(['ROBOTS', 'ENVIRONMENT'] as const)('preserves the %s cursor across pause and resume', (stage) => {
    const { game, players } = createGame()
    if (stage === 'ENVIRONMENT') for (const _player of players) game.executeNextStep()
    const before = game.executionState
    game.pause()
    expect(() => game.executeNextStep()).toThrow('paused')
    expect(() => game.executeNextAction()).toThrow('paused')
    expect(game.executionState).toEqual(before)
    expect(players[0].lastCheckpoint).toBe(0)
    game.resume()
    expect(game.executeNextStep().type).toBe(stage === 'ROBOTS' ? 'robot' : 'environment')
  })

  it.each(['ROBOTS', 'ENVIRONMENT'] as const)('cannot execute an aborted %s step', (stage) => {
    const { game, players } = createGame()
    if (stage === 'ENVIRONMENT') for (const _player of players) game.executeNextStep()
    const before = game.executionState
    game.abort()
    game.resume()
    expect(() => game.executeNextStep()).toThrow('aborted')
    expect(() => game.executeNextAction()).toThrow('aborted')
    expect(game.executionState).toEqual(before)
    expect(players[0].lastCheckpoint).toBe(0)
  })

  it('leaves environment effects pending when the last eligible robot leaves', () => {
    const { game, players } = createGame()
    game.executeNextStep()
    game.removePlayer(players[1].id)
    const cursor = game.executionState
    expect(cursor.activation?.stage).toBe('ENVIRONMENT')
    expect(game.currentRegister).toBe(0)
    expect(players[0].lastCheckpoint).toBe(0)
    game.removePlayer(players[1].id)
    expect(game.executionState).toEqual(cursor)
    game.executeNextStep()
    expect(game.currentRegister).toBe(0)
    const step = game.executeNextStep()
    expect(step.type).toBe('environment')
    if (step.type !== 'environment') throw new Error('Expected environment step')
    expect(step.result.checkpointProgress).toEqual([{ playerId: players[0].id, lastCheckpoint: 1 }])
    expect(game.currentRegister).toBe(1)
  })

  it('keeps the same environment cursor when an activated player leaves', () => {
    const { game, players } = createGame()
    game.executeNextStep()
    game.executeNextStep()
    const before = game.executionState
    game.removePlayer(players[1].id)
    expect(game.executionState).toEqual(before)
    expect(players[0].lastCheckpoint).toBe(0)
    game.executeNextStep()
    expect(players[0].lastCheckpoint).toBe(0)
    game.executeNextStep()
    expect(players[0].lastCheckpoint).toBe(1)
    expect(game.executionState.lastEnvironmentSequence).toBe(2)
  })

  it.each(['ROBOTS', 'ENVIRONMENT'] as const)('cancels pending %s work when the last member leaves', (stage) => {
    const { game, players } = createGame(1)
    if (stage === 'ENVIRONMENT') game.executeNextStep()
    game.removePlayer(players[0].id)
    expect(game.phase).toBe('programming')
    expect(game.executionState).toEqual({ roundNumber: 1, lastEnvironmentSequence: 0, activation: null })
    expect(players[0].lastCheckpoint).toBe(0)
    expect(() => game.executeNextStep()).toThrow('activation')
  })
})
