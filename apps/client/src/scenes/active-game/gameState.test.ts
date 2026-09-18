import { describe, expect, it } from 'vitest'
import {
  createMockGameState,
  placeCard,
  REGISTER_COUNT,
  registersAreFilled,
  removeCard,
  type ProgramCard,
  type Registers,
} from './gameState.ts'

const firstCard: ProgramCard = { id: 'first', instruction: 'MOVE_1' }
const secondCard: ProgramCard = { id: 'second', instruction: 'TURN_LEFT' }
const emptyRegisters: Registers = Object.freeze(
  Array.from({ length: REGISTER_COUNT }, () => null),
)

describe('createMockGameState', () => {
  it('creates the programming state', () => {
    const state = createMockGameState()

    expect(state.phase).toBe('programming')
    expect(state.hand).toHaveLength(9)
    expect(new Set(state.hand.map((card) => card.id)).size).toBe(9)
    expect(state.registers).toEqual(emptyRegisters)
    expect(state.confirmed).toBe(false)
  })
})

describe('placeCard', () => {
  it('places a card without changing the original registers', () => {
    const result = placeCard(emptyRegisters, firstCard, 2)

    expect(result).toEqual([null, null, firstCard, null, null])
    expect(result).not.toBe(emptyRegisters)
    expect(emptyRegisters).toEqual([null, null, null, null, null])
  })

  it('rejects occupied, duplicate, and invalid placements', () => {
    const occupiedRegisters = placeCard(emptyRegisters, firstCard, 0)

    expect(placeCard(occupiedRegisters, secondCard, 0)).toBe(
      occupiedRegisters,
    )
    expect(placeCard(occupiedRegisters, firstCard, 1)).toBe(
      occupiedRegisters,
    )
    expect(placeCard(emptyRegisters, firstCard, -1)).toBe(emptyRegisters)
    expect(placeCard(emptyRegisters, firstCard, REGISTER_COUNT)).toBe(
      emptyRegisters,
    )
    expect(placeCard(emptyRegisters, firstCard, 1.5)).toBe(emptyRegisters)
  })
})

describe('removeCard', () => {
  it('removes a card without changing the original registers', () => {
    const occupiedRegisters = placeCard(emptyRegisters, firstCard, 2)
    const result = removeCard(occupiedRegisters, 2)

    expect(result).toEqual(emptyRegisters)
    expect(result).not.toBe(occupiedRegisters)
    expect(occupiedRegisters[2]).toBe(firstCard)
  })

  it('preserves the registers when no card can be removed', () => {
    expect(removeCard(emptyRegisters, 0)).toBe(emptyRegisters)
    expect(removeCard(emptyRegisters, -1)).toBe(emptyRegisters)
    expect(removeCard(emptyRegisters, REGISTER_COUNT)).toBe(emptyRegisters)
    expect(removeCard(emptyRegisters, 1.5)).toBe(emptyRegisters)
  })
})

describe('registersAreFilled', () => {
  it('requires a card in every register', () => {
    expect(
      registersAreFilled([
        firstCard,
        secondCard,
        firstCard,
        secondCard,
        firstCard,
      ]),
    ).toBe(true)
    expect(
      registersAreFilled([
        firstCard,
        secondCard,
        null,
        secondCard,
        firstCard,
      ]),
    ).toBe(false)
  })
})
