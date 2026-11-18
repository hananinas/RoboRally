import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, GearTile, type Tile } from '@/domain/game/index'
import {
  calculateCheckpoints, calculateGears, captureEnvironmentSnapshot,
} from '@/domain/game/environment'
import { Integer } from '@/numbers'
import { createTestPlayer, createTestRobot } from '../../fixtures.ts'

function position(x: number, y = 1) {
  return { x: Integer(x), y: Integer(y) }
}

function createBoard(tiles?: readonly Tile[]) {
  return new Board([
    Array.from({ length: 5 }, () => new EmptyTile()),
    tiles ?? Array.from({ length: 5 }, () => new EmptyTile()),
  ], { ...position(0, 0), angle: 0 }, position(4, 0))
}

describe('environment calculations', () => {
  function setup() {
    const board = createBoard([
      new GearTile('CLOCKWISE', [Direction.NORTH]), new EmptyTile([], 1),
      new EmptyTile(), new EmptyTile(), new EmptyTile(),
    ])
    const players = [0, 1].map((x) => {
      const robot = createTestRobot({ id: `robot-${x}`, direction: Direction.NORTH })
      board.placeRobot(robot.id, position(x))
      return createTestPlayer({ id: `player-${x}`, robot })
    })
    return { board, players }
  }

  it('calculates gear and checkpoint changes without applying them to the game', () => {
    const { board, players } = setup()
    const snapshot = captureEnvironmentSnapshot(board, players)

    expect(calculateGears(snapshot)).toEqual({
      kind: 'GEARS', robots: [{ robotId: 'robot-0', position: position(0), direction: Direction.EAST }],
    })
    expect(calculateCheckpoints(snapshot)).toEqual({
      kind: 'CHECKPOINTS', checkpointProgress: [{ playerId: 'player-1', lastCheckpoint: 1 }],
    })
    expect(players[0].robot.direction).toBe(Direction.NORTH)
    expect(board.positionOf('robot-0')).toEqual(position(0))
    expect(players[1].lastCheckpoint).toBe(0)
  })

  it('isolates calculations from later live changes', () => {
    const { board, players } = setup()
    const snapshot = captureEnvironmentSnapshot(board, players)
    const gearChanges = calculateGears(snapshot)
    const checkpointChanges = calculateCheckpoints(snapshot)
    board.relocateRobot('robot-0', position(2))
    players[0].robot.turn(1)
    players[1].completeCheckpoint(1)

    expect(calculateGears(snapshot)).toEqual(gearChanges)
    expect(calculateCheckpoints(snapshot)).toEqual(checkpointChanges)
    const nextSnapshot = captureEnvironmentSnapshot(board, players)
    expect(calculateGears(nextSnapshot)).toEqual({ kind: 'GEARS', robots: [] })
    expect(calculateCheckpoints(nextSnapshot)).toEqual({ kind: 'CHECKPOINTS', checkpointProgress: [] })
  })
})
