export type ProgramCardType = 'MOVE_1' | 'TURN_LEFT' | 'TURN_RIGHT'

export type ProgramCard = {
  id: string
  label: string
  type: ProgramCardType
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

//card types for the robot
const cardTypes : ProgramCardType[] = [
  'MOVE_1',
  'TURN_LEFT',
  'MOVE_1',
  'TURN_RIGHT',
  'MOVE_1',
  'TURN_LEFT',
  'MOVE_1',
  'TURN_RIGHT',
  'MOVE_1',
]

function cardLabel(type: ProgramCardType): string {

  switch (type) {
    case 'MOVE_1':
      return 'Move 1'
    case 'TURN_LEFT':
      return 'Turn Left'
    case 'TURN_RIGHT':
      return 'Turn Right'
    default:
      return ''
  }
}

// Creates temporary client state.
export function createMockGameState(): ClientGameState {
  
  return {
    phase: 'programming',
    player: {
      name: 'Player Name',
    },
    hand: cardTypes.map((type, index) => ({
      id: `card-${index + 1}`,
      label : cardLabel(type),
      type,
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
