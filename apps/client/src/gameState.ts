export type ProgramCard = {
  id: string
  label: string
}

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

export function createMockGameState(): ClientGameState {
  const cardLabels = [
    'Move 1',
    'Turn Left',
    'Move 1',
    'Turn Left',
    'Move 1',
    'Turn Left',
    'Move 1',
    'Turn Left',
    'Move 1',
  ]

  return {
    phase: 'programming',
    player: {
      name: 'Player Name',
    },
    hand: cardLabels.map((label, index) => ({
      id: `card-${index + 1}`,
      label,
    })),
    registers: Array.from({ length: REGISTER_COUNT }, () => null),
    confirmed: false,
  }
}

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

export function registersAreFilled(registers: Registers): boolean {
  return registers.every((card) => card !== null)
}
