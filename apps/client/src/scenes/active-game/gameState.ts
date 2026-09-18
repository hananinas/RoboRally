import type { Card } from '@robo-rally/game-events'

export type ProgramCard = Card

export type Registers = readonly (ProgramCard | null)[]

export type ClientGameState = {
  phase: 'programming'
  player: {
    name: string
  }
  hand: readonly ProgramCard[]
  registers: Registers
  confirmed: boolean
}

export const REGISTER_COUNT = 5

// Creates temporary client state for the programming-card UI.
export function createMockGameState(): ClientGameState {
  const instructions = [
    'MOVE_1',
    'TURN_LEFT',
    'MOVE_1',
    'TURN_LEFT',
    'MOVE_1',
    'TURN_LEFT',
    'MOVE_1',
    'TURN_LEFT',
    'MOVE_1',
  ] as const

  return {
    phase: 'programming',
    player: {
      name: 'Player Name',
    },
    hand: instructions.map((instruction, index) => ({
      id: `card-${index + 1}`,
      instruction,
    })),
    registers: Array.from({ length: REGISTER_COUNT }, () => null),
    confirmed: false,
  }
}

// Places a card when allowed.
export function placeCard(
  registers: Registers,
  card: ProgramCard,
  registerIndex: number,
): Registers {
  const cannotPlace =
    !Number.isInteger(registerIndex) ||
    registerIndex < 0 ||
    registerIndex >= registers.length ||
    registers[registerIndex] !== null ||
    registers.some((registeredCard) => registeredCard?.id === card.id)

  if (cannotPlace) return registers

  return registers.map((registeredCard, index) =>
    index === registerIndex ? card : registeredCard,
  )
}

// Removes a registered card.
export function removeCard(
  registers: Registers,
  registerIndex: number,
): Registers {
  const cannotRemove =
    !Number.isInteger(registerIndex) ||
    registerIndex < 0 ||
    registerIndex >= registers.length ||
    registers[registerIndex] === null

  if (cannotRemove) return registers

  return registers.map((registeredCard, index) =>
    index === registerIndex ? null : registeredCard,
  )
}

// Checks whether every register is filled.
export function registersAreFilled(registers: Registers): boolean {
  return registers.every((card) => card !== null)
}