import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, Game, Player, Robot } from '@/game/index.ts'
import type { Antenna, MovementResult, Position, RobotId } from '@/game/index.ts'

function createMultiplayerGame(
  positions: readonly Position[],
  antenna: Antenna = { x: 4, y: 4, angle: Math.PI / 2 },
  board = new Board(Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new EmptyTile()),
  )),
  deck: readonly Card[] = Array.from({ length: 6 }, (_, index) => new Card(`left-${index}`, 'TURN_LEFT')),
) {
  const players = positions.map((position, index) => {
    const robot = new Robot(`robot-${index}`, Direction.EAST)
    board.placeRobot(robot.id, position)
    return new Player(`player-${index}`, robot)
  })
  const game = new Game(board, players, deck, antenna)
  return { board, players, deck, antenna, game }
}

describe('Game fixed-roster programming', () => {
  it('waits for every player and preserves accepted programs after rejected submissions', () => {
    const { players, deck, game } = createMultiplayerGame([{ x: 4, y: 5 }, { x: 5, y: 4 }])
    const firstProgram = deck.slice(0, 5)
    const secondProgram = deck.slice(1, 6).reverse()
    game.submitProgram(players[0].id, firstProgram)

    expect(game.phase).toBe('programming')
    expect(game.hasSubmittedProgram(players[0].id)).toBe(true)
    expect(game.hasSubmittedProgram(players[1].id)).toBe(false)
    expect(game.hasSubmittedProgram('unknown')).toBe(false)
    expect(() => game.executeNextAction()).toThrow()
    expect(() => game.submitProgram(players[0].id, secondProgram)).toThrow()
    expect(() => game.submitProgram(players[1].id, [...deck.slice(0, 4), new Card('foreign', 'MOVE_1')])).toThrow()
    expect(() => game.submitProgram(players[1].id, [deck[0], ...deck.slice(0, 4)])).toThrow()
    expect(() => game.submitProgram('unknown', secondProgram)).toThrow()
    game.recheckProgrammingPhase()

    expect(players[0].robot.program).toEqual(firstProgram)
    expect(players[1].robot.program).toEqual([])
    expect(game.hasSubmittedProgram(players[1].id)).toBe(false)
    expect(game.phase).toBe('programming')

    game.submitProgram(players[1].id, secondProgram)
    expect(game.phase).toBe('activation')
    expect(players[1].robot.program).toEqual(secondProgram)
    game.executeNextAction()
    game.recheckProgrammingPhase()
    expect(game.executeNextAction().action.robotId).toBe(players[1].robot.id)
  })

  it('copies the fixed roster and keeps an empty roster idle', () => {
    const { board, players, deck, antenna, game } = createMultiplayerGame([{ x: 4, y: 5 }])
    const player = players[0]
    players.length = 0
    expect(game.players).toEqual([player])
    expect(() => Object.assign(game.players, { 1: player })).toThrow()
    game.submitProgram(player.id, deck.slice(0, 5))
    expect(game.phase).toBe('activation')

    const empty = new Game(board, [], deck, antenna)
    empty.recheckProgrammingPhase()
    expect(empty.phase).toBe('programming')
    expect(empty.currentRegister).toBe(0)
    expect(() => empty.executeNextAction()).toThrow()
    expect(() => empty.submitProgram(player.id, deck.slice(0, 5))).toThrow()
  })

  it('rejects duplicate player IDs, duplicate robot IDs, and unplaced robots', () => {
    const { board, players, deck, antenna } = createMultiplayerGame([{ x: 4, y: 5 }, { x: 5, y: 4 }])
    expect(() => new Game(board, [players[0], new Player(players[0].id, players[1].robot)], deck, antenna)).toThrow(RangeError)
    expect(() => new Game(board, [players[0], new Player('other', new Robot(players[0].robot.id, Direction.NORTH))], deck, antenna)).toThrow(RangeError)
    expect(() => new Game(board, [new Player('unplaced', new Robot('unplaced', Direction.NORTH))], deck, antenna)).toThrow()
  })

  it('validates and freezes an independent positioned antenna', () => {
    const antenna = { x: 4, y: 4, angle: Math.PI / 2 }
    const { board, players, deck, game } = createMultiplayerGame([{ x: 4, y: 5 }], antenna)
    antenna.x = 0
    antenna.angle = 0
    expect(game.antenna).toEqual({ x: 4, y: 4, angle: Math.PI / 2 })
    expect(() => Object.assign(game.antenna, { angle: 0 })).toThrow()
    for (const invalid of [
      { x: -1, y: 0, angle: 0 },
      { x: 0, y: board.height, angle: 0 },
      { x: 0.5, y: 0, angle: 0 },
      { x: 0, y: 0, angle: Infinity },
      { x: 0, y: 0, angle: NaN },
    ]) {
      expect(() => new Game(board, players, deck, invalid)).toThrow(RangeError)
    }
  })
})

describe('Game multiplayer activation', () => {
  it('advances the register when the only robot still waiting to act leaves', () => {
    const { players, deck, game } = createMultiplayerGame([{ x: 4, y: 5 }, { x: 5, y: 4 }])
    for (const player of players) game.submitProgram(player.id, deck.slice(0, 5))
    expect(game.executeNextAction().action.robotId).toBe(players[0].robot.id)

    game.removePlayer(players[1].id)

    expect(game.currentRegister).toBe(1)
    expect(game.executeNextAction().action.robotId).toBe(players[0].robot.id)
    expect(game.currentRegister).toBe(2)
  })

  it('returns to programming when the last member leaves during activation', () => {
    const { players, deck, game } = createMultiplayerGame([{ x: 4, y: 5 }])
    game.submitProgram(players[0].id, deck.slice(0, 5))

    game.removePlayer(players[0].id)

    expect(game.phase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(game.players).toEqual([])
    expect(game.hasStarted).toBe(true)
  })

  it('executes every robot in register-major order and resets every hand and barrier for two rounds', () => {
    const { players, deck, game } = createMultiplayerGame([
      { x: 5, y: 4 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
    ])
    const expectedOrder = [players[1], players[0], players[2]]
    const programs = players.map((_, playerIndex) =>
      Array.from({ length: 5 }, (_, registerIndex) => deck[(playerIndex + registerIndex) % deck.length]),
    )
    for (let round = 1; round <= 2; round++) {
      players.forEach((player, index) => {
        expect(player.hand).toEqual(deck)
        game.submitProgram(player.id, programs[index])
        expect(game.phase).toBe(index === players.length - 1 ? 'activation' : 'programming')
        player.setHand([])
      })

      for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
        for (let robotIndex = 0; robotIndex < expectedOrder.length; robotIndex++) {
          const player = expectedOrder[robotIndex]
          const result = game.executeNextAction()
          expect(result.registerIndex).toBe(registerIndex)
          expect(result.action.robotId).toBe(player.robot.id)
          expect(result.action.card).toBe(programs[players.indexOf(player)][registerIndex])
          const registerFinished = robotIndex === expectedOrder.length - 1
          expect(game.currentRegister).toBe(registerFinished ? (registerIndex + 1) % 5 : registerIndex)
          expect(game.phase).toBe(registerFinished && registerIndex === 4 ? 'programming' : 'activation')
        }
      }

      for (const player of players) {
        expect(player.robot.program).toEqual([])
        expect(player.hand).toEqual(deck)
        expect(game.hasSubmittedProgram(player.id)).toBe(false)
      }
      game.recheckProgrammingPhase()
      expect(game.phase).toBe('programming')
      expect(() => game.executeNextAction()).toThrow()
    }
  })

  it('ranks Manhattan distance before clockwise angle, including wraparound', () => {
    const { players, deck, game } = createMultiplayerGame([
      { x: 5, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 4, y: 2 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
    ], { x: 4, y: 4, angle: 7 * Math.PI / 4 })
    for (const player of players) game.submitProgram(player.id, deck.slice(0, 5))
    const order = players.map(() => game.executeNextAction().action.robotId)
    // The distance-three robot precedes the Euclidean-nearer distance-four robot.
    // At distance two, east wraps past 2π before west and then north.
    expect(order).toEqual([
      players[4].robot.id,
      players[5].robot.id,
      players[2].robot.id,
      players[3].robot.id,
      players[0].robot.id,
      players[1].robot.id,
    ])
  })

  it('retains roster order for exact priority ties', () => {
    class TiedPositionBoard extends Board {
      override positionOf(robotId: RobotId): Position {
        super.positionOf(robotId)
        return { x: 4, y: 5 }
      }
    }
    const board = new TiedPositionBoard(Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new EmptyTile()),
    ))
    const { players, deck, game } = createMultiplayerGame(
      [{ x: 4, y: 5 }, { x: 5, y: 4 }], undefined, board,
    )
    for (const player of [...players].reverse()) game.submitProgram(player.id, deck.slice(0, 5))
    expect(game.executeNextAction().action.robotId).toBe(players[0].robot.id)
    expect(game.executeNextAction().action.robotId).toBe(players[1].robot.id)
  })

  it('recalculates pending priority from positions changed by an earlier action', () => {
    class DisplacingBoard extends Board {
      override moveRobot(robotId: RobotId, direction: Direction, steps: number): MovementResult {
        const result = super.moveRobot(robotId, direction, steps)
        if (robotId === 'robot-0') super.moveRobot('robot-1', Direction.SOUTH, 2)
        return result
      }
    }
    const board = new DisplacingBoard(Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new EmptyTile()),
    ))
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    const { players, game } = createMultiplayerGame(
      [{ x: 4, y: 5 }, { x: 4, y: 6 }, { x: 6, y: 4 }], undefined, board, deck,
    )
    for (const player of players) game.submitProgram(player.id, deck)
    expect(game.executeNextAction().action.robotId).toBe(players[0].robot.id)
    expect(board.positionOf(players[1].robot.id)).toEqual({ x: 4, y: 8 })
    expect(game.executeNextAction().action.robotId).toBe(players[2].robot.id)
    expect(game.executeNextAction().action.robotId).toBe(players[1].robot.id)
    expect(game.currentRegister).toBe(1)
  })

  it('reports blocked actions and keeps earlier position snapshots independent', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    const { board, players, game } = createMultiplayerGame(
      [{ x: 7, y: 4 }, { x: 6, y: 4 }], { x: 8, y: 4, angle: 0 }, undefined, deck,
    )
    for (const player of players) game.submitProgram(player.id, deck)
    const first = game.executeNextAction()
    expect(first.action.position).toEqual({ x: 8, y: 4 })
    expect(game.executeNextAction().action.position).toEqual({ x: 7, y: 4 })
    const edgeBlocked = game.executeNextAction()
    expect(edgeBlocked.action).toMatchObject({ robotId: players[0].robot.id, card: deck[1], position: { x: 8, y: 4 } })
    const robotBlocked = game.executeNextAction()
    expect(robotBlocked.action).toMatchObject({ robotId: players[1].robot.id, card: deck[1], position: { x: 7, y: 4 } })
    expect(game.currentRegister).toBe(2)

    board.moveRobot(players[0].robot.id, Direction.NORTH, 1)
    expect(board.positionOf(players[0].robot.id)).toEqual({ x: 8, y: 3 })
    expect(first.action.position).toEqual({ x: 8, y: 4 })
    expect(edgeBlocked.action.position).toEqual({ x: 8, y: 4 })
    Object.assign(first.action.position, { x: 0 })
    expect(edgeBlocked.action.position).toEqual({ x: 8, y: 4 })
    expect(board.positionOf(players[0].robot.id)).toEqual({ x: 8, y: 3 })
  })
})
