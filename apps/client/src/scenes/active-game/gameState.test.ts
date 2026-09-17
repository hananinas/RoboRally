import {describe, expect, it } from 'vitest'
import {
  createProgrammingDeck,
  type ProgramCardType,
  createMockGameState,
  placeCard,
  REGISTER_COUNT,
  registersAreFilled,
  removeCard,
  type ProgramCard,
  type Registers,
} from './gameState.ts'

const firstCard: ProgramCard = { id: 'first', label: 'Move' }
const secondCard: ProgramCard = { id: 'second', label: 'Turn' }
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

it('creates a 20-card programming deck', () => {
  const deck = createProgrammingDeck()

  expect(deck).toHaveLength(20)
})

it('creates the expected programming card distribution', () => {
  const deck = createProgrammingDeck()

  const counts = deck.reduce(
    (result, card) => {
      result[card.type] = (result[card.type] ?? 0) + 1
      return result
    },
    {} as Record<ProgramCardType, number>,
  )

  expect(counts.MOVE_1).toBe(5)
  expect(counts.MOVE_2).toBe(3)
  expect(counts.MOVE_3).toBe(1)

  expect(counts.TURN_LEFT).toBe(3)
  expect(counts.TURN_RIGHT).toBe(3)
  expect(counts.U_TURN).toBe(1)

  expect(counts.BACK_UP).toBe(1)
  expect(counts.POWER_UP).toBe(1)
  expect(counts.AGAIN).toBe(2)
})