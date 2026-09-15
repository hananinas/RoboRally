import { describe, expect, it } from 'vitest'
import { MoveForward, TurnLeft } from './Card.js'

describe('MoveForward', () => {
  it('describes moving the robot forward by one tile', () => {
    const card = new MoveForward('move-1')

    expect(card.id).toBe('move-1')
    expect(card.action).toEqual({
      type: 'move-forward',
      steps: 1,
    })
  })
})

describe('TurnLeft', () => {
  it('describes turning the robot left', () => {
    const card = new TurnLeft('left-1')

    expect(card.id).toBe('left-1')
    expect(card.action).toEqual({
      type: 'turn-left',
    })
  })
})
