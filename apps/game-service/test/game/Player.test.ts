import { resolveRobotAction } from '../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import { Direction, Card, Player, Robot, createGame } from '@/game/index'

describe('Player', () => {
  it('keeps its robot and copies assigned hands', () => {
    const robot = new Robot('robot-1', Direction.EAST)
    const firstHand = [new Card('move-1', 'MOVE_1')]
    const player = new Player('player-1', robot, firstHand)
    firstHand.pop()

    expect(player.id).toBe('player-1')
    expect(player.robot).toBe(robot)
    expect(player.hand.map((card) => card.id)).toEqual(['move-1'])

    const nextHand = [new Card('left-1', 'TURN_LEFT')]
    player.setHand(nextHand)
    nextHand.pop()
    expect(player.hand.map((card) => card.id)).toEqual(['left-1'])
  })

  it('starts each player at checkpoint zero and tracks their progress independently', () => {
    const first = new Player('player-1', new Robot('robot-1', Direction.EAST))
    const second = new Player('player-2', new Robot('robot-2', Direction.EAST))

    expect(first.lastCheckpoint).toBe(0)
    expect(second.lastCheckpoint).toBe(0)
    expect(first.completeCheckpoint(1)).toBe(true)
    expect(first.lastCheckpoint).toBe(1)
    expect(second.lastCheckpoint).toBe(0)
    expect(second.completeCheckpoint(1)).toBe(true)
    expect(second.lastCheckpoint).toBe(1)
  })

  it('only records the next checkpoint, without repeating, skipping or losing progress', () => {
    const player = new Player('player-1', new Robot('robot-1', Direction.EAST))

    expect(player.completeCheckpoint(2)).toBe(false)
    expect(player.lastCheckpoint).toBe(0)
    expect(player.completeCheckpoint(1)).toBe(true)
    expect(player.completeCheckpoint(1)).toBe(false)
    expect(player.completeCheckpoint(3)).toBe(false)
    expect(player.lastCheckpoint).toBe(1)
    expect(player.completeCheckpoint(2)).toBe(true)
    expect(player.completeCheckpoint(1)).toBe(false)
    expect(player.lastCheckpoint).toBe(2)
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid checkpoint number %s without changing progress',
    (checkpointNumber) => {
      const player = new Player('player-1', new Robot('robot-1', Direction.EAST))

      expect(player.completeCheckpoint(checkpointNumber)).toBe(false)
      expect(player.lastCheckpoint).toBe(0)
    },
  )

  it('preserves checkpoint progress across rounds and program clearing', () => {
    const { game } = createGame('empty-map')
    const player = game.addPlayer()._unsafeUnwrap()
    player.completeCheckpoint(1)

    for (let round = 0; round < 2; round++) {
      game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
      for (let register = 0; register < 5; register++) resolveRobotAction(game)

      expect(game.phase).toBe('programming')
      expect(player.robot.program).toEqual([])
      expect(player.lastCheckpoint).toBe(1)
    }
  })
})
