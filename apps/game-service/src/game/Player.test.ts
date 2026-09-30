import { describe, expect, it } from 'vitest'
import { Direction, Card, Player, Robot } from './index.js'

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
})
