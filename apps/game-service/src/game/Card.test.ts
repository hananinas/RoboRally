import { describe, expect, it } from 'vitest'
import { MoveForward, TurnLeft, type CardExecutionContext } from './Card.js'

function createContext(): CardExecutionContext & {
  movedSteps: number
  turns: number
} {
  return {
    movedSteps: 0,
    turns: 0,
    moveForward(steps) {
      this.movedSteps += steps
    },
    turnLeft() {
      this.turns += 1
    },
  }
}

describe('MoveForward', () => {
  it('moves forward by one tile', () => {
    const card = new MoveForward('move-1')
    const context = createContext()

    card.execute(context)

    expect(card.id).toBe('move-1')
    expect(card.action).toEqual({
      type: 'move-forward',
      steps: 1,
    })
    expect(context.movedSteps).toBe(1)
    expect(context.turns).toBe(0)
  })
})

describe('TurnLeft', () => {
  it('turns left once', () => {
    const card = new TurnLeft('left-1')
    const context = createContext()

    card.execute(context)

    expect(card.id).toBe('left-1')
    expect(card.action).toEqual({
      type: 'turn-left',
    })
    expect(context.movedSteps).toBe(0)
    expect(context.turns).toBe(1)
  })
})
