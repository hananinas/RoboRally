import { resolveRobotAction } from '../../activationTestHelper.js'
import { describe, expect, it } from 'vitest'
import { Card, Deck, Direction, EmptyTile, Player, Robot } from '@/domain/game/index.ts'
import type { Antenna, Position } from '@/domain/game/index.ts'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestBoard, createTestGame, createTestPlacement, instructionsOf } from '../../fixtures.ts'

function createMultiplayerGame(
  positions: readonly Position[],
  antenna: Antenna = { x: Integer(4), y: Integer(4), angle: Math.PI / 2 },
  board = createTestBoard(createEmptyTileGrid(9, 9), antenna, { x: Integer(0), y: Integer(0) }),
  deck: readonly Card[] = Array.from({ length: 6 }, (_, index) => new Card(`left-${index}`, 'TURN_LEFT')),
) {
  const placements = positions.map((position) =>
    createTestPlacement(position, { direction: Direction.EAST, deck: new Deck(deck) }))
  const players = placements.map(({ player }) => player)
  const game = createTestGame({ board, players: placements, deck: instructionsOf(deck) })
  return { board, players, deck, game }
}

describe('Game fixed-roster programming', () => {
  it('waits for every player and preserves accepted programs after rejected submissions', () => {
    const { players, deck, game } = createMultiplayerGame([{ x: Integer(4), y: Integer(5) }, { x: Integer(5), y: Integer(4) }])
    const firstProgram = deck.slice(0, 5)
    const secondProgram = deck.slice(1, 6).reverse()
    const firstProgramIds = firstProgram.map((card) => card.id)
    const secondProgramIds = secondProgram.map((card) => card.id)
    game.submitProgram(players[0].id, firstProgramIds)

    expect(game.lastActivePhase).toBe('programming')
    expect(game.hasSubmittedProgram(players[0].id)).toBe(true)
    expect(game.hasSubmittedProgram(players[1].id)).toBe(false)
    expect(game.hasSubmittedProgram('unknown')).toBe(false)
    expect(() => resolveRobotAction(game)).toThrow()
    expect(game.submitProgram(players[0].id, secondProgramIds)._unsafeUnwrapErr()).toBe('ALREADY_SUBMITTED')
    expect(game.submitProgram(players[1].id, [...deck.slice(0, 4).map((card) => card.id), 'foreign'])._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')
    expect(game.submitProgram(players[1].id, [deck[0].id, ...deck.slice(0, 4).map((card) => card.id)])._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')
    expect(game.submitProgram('unknown', secondProgramIds)._unsafeUnwrapErr()).toBe('PLAYER_NOT_IN_GAME')

    expect(players[0].robot.program).toEqual(firstProgram)
    expect(players[1].robot.program).toEqual([])
    expect(game.hasSubmittedProgram(players[1].id)).toBe(false)
    expect(game.lastActivePhase).toBe('programming')

    game.submitProgram(players[1].id, secondProgramIds)
    expect(game.lastActivePhase).toBe('activation')
    expect(players[1].robot.program).toEqual(secondProgram)
    resolveRobotAction(game)
    expect(resolveRobotAction(game).action.robotId).toBe(players[1].robot.id)
  })

  it('copies the fixed roster and keeps an empty roster idle', () => {
    const { board, players, deck, game } = createMultiplayerGame([{ x: Integer(4), y: Integer(5) }])
    const player = players[0]
    players.length = 0
    expect(game.players).toEqual([player])
    expect(() => Object.assign(game.players, { 1: player })).toThrow()
    game.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))
    expect(game.lastActivePhase).toBe('activation')

    const empty = createTestGame({ board, players: [], deck: instructionsOf(deck) })
    expect(empty.lastActivePhase).toBe('programming')
    expect(empty.currentRegister).toBe(0)
    expect(() => empty.executeNextAction()).toThrow()
    expect(empty.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))._unsafeUnwrapErr()).toBe('PLAYER_NOT_IN_GAME')
  })

  it('rejects duplicate player IDs and duplicate robot IDs', () => {
    const first = { x: Integer(4), y: Integer(5) }
    const second = { x: Integer(5), y: Integer(4) }
    const { players, deck } = createMultiplayerGame([first, second])
    const emptyDeck = new Deck([])
    const freshBoard = () => createTestBoard(
      createEmptyTileGrid(9, 9), { x: Integer(4), y: Integer(4), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) },
    )

    expect(() => createTestGame({
      board: freshBoard(),
      players: [
        { player: players[0], position: first },
        { player: new Player(players[0].id, players[1].robot, emptyDeck), position: second },
      ],
      deck: instructionsOf(deck),
    })).toThrow(RangeError)

    expect(() => createTestGame({
      board: freshBoard(),
      players: [
        { player: players[0], position: first },
        { player: new Player('other', new Robot(players[0].robot.id, Direction.NORTH, 'red', 'tank'), emptyDeck), position: second },
      ],
      deck: instructionsOf(deck),
    })).toThrow(RangeError)
  })

  it('exposes the antenna of its board', () => {
    const antenna = { x: Integer(4), y: Integer(4), angle: Math.PI / 2 }
    const { board, game } = createMultiplayerGame([{ x: Integer(4), y: Integer(5) }], antenna)
    expect(game.board.antenna).toEqual(antenna)
    expect(game.board.antenna).toBe(board.antenna)
  })
})

describe('Game multiplayer activation', () => {
  it('advances the register when the only robot still waiting to act leaves', () => {
    const { players, deck, game } = createMultiplayerGame([{ x: Integer(4), y: Integer(5) }, { x: Integer(5), y: Integer(4) }])
    for (const player of players) game.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))
    expect(resolveRobotAction(game).action.robotId).toBe(players[0].robot.id)

    const { roundConcluded } = game.removePlayer(players[1].id)

    expect(roundConcluded).toBe(false)
    expect(game.currentRegister).toBe(0)
    game.executeNextStep()
    game.executeNextStep()
    expect(game.currentRegister).toBe(1)
    expect(resolveRobotAction(game).action.robotId).toBe(players[0].robot.id)
    expect(game.currentRegister).toBe(2)
  })

  it('returns to programming when the last member leaves during activation', () => {
    const { players, deck, game } = createMultiplayerGame([{ x: Integer(4), y: Integer(5) }])
    game.submitProgram(players[0].id, deck.slice(0, 5).map((card) => card.id))

    const { roundConcluded } = game.removePlayer(players[0].id)

    expect(roundConcluded).toBe(true)
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(game.players).toEqual([])
  })

  it('executes every robot in register-major order and resets every hand and barrier for two rounds', () => {
    const { players, deck, game } = createMultiplayerGame([
      { x: Integer(5), y: Integer(4) },
      { x: Integer(4), y: Integer(5) },
      { x: Integer(4), y: Integer(6) },
    ])
    const expectedOrder = [players[1], players[0], players[2]]
    const programs = players.map((_, playerIndex) =>
      Array.from({ length: 5 }, (_, registerIndex) => deck[(playerIndex + registerIndex) % deck.length]),
    )
    for (let round = 1; round <= 2; round++) {
      players.forEach((player, index) => {
        expect(player.hand).toHaveLength(deck.length)
        expect(player.hand).toEqual(expect.arrayContaining([...deck]))
        expect(player.registers).toEqual(Array.from({ length: 5 }, () => ({ status: 'EMPTY' })))
        expect(game.updateRegisters(player.id, programs[index].map((card) => card.id))._unsafeUnwrap()).toBeUndefined()
        game.submitProgram(player.id, programs[index].map((card) => card.id))
        expect(game.lastActivePhase).toBe(index === players.length - 1 ? 'activation' : 'programming')
      })

      for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
        for (let robotIndex = 0; robotIndex < expectedOrder.length; robotIndex++) {
          const player = expectedOrder[robotIndex]
          const result = resolveRobotAction(game)
          expect(result.registerIndex).toBe(registerIndex)
          expect(result.action.robotId).toBe(player.robot.id)
          expect(result.action.card).toBe(programs[players.indexOf(player)][registerIndex])
          expect(result.registers).toEqual(Array.from({ length: 5 }, (_, index) => index <= registerIndex
            ? { status: 'REVEALED', instruction: programs[players.indexOf(player)][index].instruction }
            : { status: 'HIDDEN' }))
          const registerFinished = robotIndex === expectedOrder.length - 1
          expect(game.currentRegister).toBe(registerFinished ? (registerIndex + 1) % 5 : registerIndex)
          expect(game.lastActivePhase).toBe(registerFinished && registerIndex === 4 ? 'programming' : 'activation')
        }
      }

      for (const player of players) {
        expect(player.robot.program).toEqual([])
        expect(player.hand).toHaveLength(deck.length)
        expect(player.hand).toEqual(expect.arrayContaining([...deck]))
        expect(player.registers).toEqual(Array.from({ length: 5 }, () => ({ status: 'EMPTY' })))
        expect(game.hasSubmittedProgram(player.id)).toBe(false)
      }
      expect(game.lastActivePhase).toBe('programming')
      expect(() => resolveRobotAction(game)).toThrow()
    }
  })

  it('ranks Manhattan distance before clockwise angle, including wraparound', () => {
    const { players, deck, game } = createMultiplayerGame([
      { x: Integer(5), y: Integer(2) },
      { x: Integer(2), y: Integer(2) },
      { x: Integer(2), y: Integer(4) },
      { x: Integer(4), y: Integer(2) },
      { x: Integer(5), y: Integer(4) },
      { x: Integer(6), y: Integer(4) },
    ], { x: Integer(4), y: Integer(4), angle: 7 * Math.PI / 4 })
    for (const player of players) game.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))
    const order = players.map(() => resolveRobotAction(game).action.robotId)
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

  it('recalculates pending priority from positions changed by an earlier action', () => {
    const antenna = { x: Integer(4), y: Integer(4), angle: Math.PI / 2 }
    const board = createTestBoard(createEmptyTileGrid(9, 9), antenna, { x: Integer(0), y: Integer(0) })
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    const { players, game } = createMultiplayerGame(
      [{ x: Integer(4), y: Integer(5) }, { x: Integer(4), y: Integer(6) }, { x: Integer(3), y: Integer(5) }], antenna, board, deck,
    )
    players[0].robot.turn(3)
    for (const player of players) game.submitProgram(player.id, deck.map((card) => card.id))
    expect(resolveRobotAction(game).action.robotId).toBe(players[0].robot.id)
    expect(game.getRobotPosition(players[1].robot.id)).toEqual({ x: 4, y: 7 })
    expect(resolveRobotAction(game).action.robotId).toBe(players[2].robot.id)
    expect(resolveRobotAction(game).action.robotId).toBe(players[1].robot.id)
    expect(game.currentRegister).toBe(1)
  })

  it('reports blocked actions and keeps earlier position snapshots independent', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    const tiles = createEmptyTileGrid(9, 9)
    tiles[4][8] = new EmptyTile([Direction.EAST])
    const antenna = { x: Integer(8), y: Integer(2), angle: 0 }
    const board = createTestBoard(tiles, antenna, { x: Integer(0), y: Integer(0) })
    const { players, game } = createMultiplayerGame(
      [{ x: Integer(7), y: Integer(4) }, { x: Integer(6), y: Integer(4) }], antenna, board, deck,
    )
    for (const player of players) game.submitProgram(player.id, deck.map((card) => card.id))
    const first = resolveRobotAction(game)
    expect(first.action.position).toEqual({ x: 8, y: 4 })
    expect(resolveRobotAction(game).action.position).toEqual({ x: 7, y: 4 })
    const wallBlocked = resolveRobotAction(game)
    expect(wallBlocked.action).toMatchObject({ robotId: players[0].robot.id, card: deck[1], position: { x: 8, y: 4 } })
    const robotBlocked = resolveRobotAction(game)
    expect(robotBlocked.action).toMatchObject({ robotId: players[1].robot.id, card: deck[1], position: { x: 7, y: 4 } })
    expect(game.currentRegister).toBe(2)

    expect(first.action.position).toEqual({ x: 8, y: 4 })
    expect(wallBlocked.action.position).toEqual({ x: 8, y: 4 })
    Object.assign(first.action.position, { x: 0 })
    expect(wallBlocked.action.position).toEqual({ x: 8, y: 4 })
    expect(game.getRobotPosition(players[0].robot.id)).toEqual({ x: 8, y: 4 })
  })
})
