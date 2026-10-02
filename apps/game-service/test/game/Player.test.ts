import { describe, expect, it } from 'vitest'
import { Direction, Move1, Player, Robot, TurnLeft } from '@/game/index.js'

describe('Player', () => {
  it('keeps its robot and copies assigned hands', () => {
    const robot = new Robot('robot-1', Direction.EAST)
    const firstHand = [new Move1('move-1')]
    const player = new Player('player-1', robot, firstHand)
    firstHand.pop()

    expect(player.id).toBe('player-1')
    expect(player.robot).toBe(robot)
    expect(player.hand.map((card) => card.id)).toEqual(['move-1'])

    const nextHand = [new TurnLeft('left-1')]
    player.setHand(nextHand)
    nextHand.pop()
    expect(player.hand.map((card) => card.id)).toEqual(['left-1'])
  })
})
