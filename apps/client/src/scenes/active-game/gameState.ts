


export type ProgramCardType =
  | 'MOVE_1'
  | 'MOVE_2'
  | 'MOVE_3'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'U_TURN'
  | 'BACK_UP'
  | 'POWER_UP'
  | 'AGAIN'

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
export const PROGRAMMING_DECK_SIZE = 20
export const PROGRAMMING_HAND_SIZE = 9

// Returns the display name for a programming card.
export function cardLabel(type: ProgramCardType): string {
  switch (type) {
    case 'MOVE_1':
      return 'Move 1'

    case 'MOVE_2':
      return 'Move 2'

    case 'MOVE_3':
      return 'Move 3'

    case 'TURN_LEFT':
      return 'Turn Left'

    case 'TURN_RIGHT':
      return 'Turn Right'

    case 'U_TURN':
      return 'U-Turn'

    case 'BACK_UP':
      return 'Back Up'

    case 'POWER_UP':
      return 'Power Up'

    case 'AGAIN':
      return 'Again'
  }
}

// Creates one 20-card programming deck.
export function createProgrammingDeck(): ProgramCard[] {
  const cardTypes: ProgramCardType[] = [
    // Move cards
    'MOVE_1',
    'MOVE_1',
    'MOVE_1',
    'MOVE_1',
    'MOVE_1',

    'MOVE_2',
    'MOVE_2',
    'MOVE_2',

    'MOVE_3',

    // Turning cards
    'TURN_LEFT',
    'TURN_LEFT',
    'TURN_LEFT',

    'TURN_RIGHT',
    'TURN_RIGHT',
    'TURN_RIGHT',

    'U_TURN',

    // Other programming cards
    'BACK_UP',
    'POWER_UP',

    // Repeat previous register
    'AGAIN',
    'AGAIN',
  ]

  return cardTypes.map((type, index) => ({
    id: `program-card-${index + 1}`,
    label: cardLabel(type),
    type,
  }))
}

// Creates temporary client state.
export function createMockGameState(): ClientGameState {
  const deck = createProgrammingDeck()

  return {
    phase: 'programming',

    player: {
      name: 'Player Name',
    },

    // The real game draws nine cards during programming.
    hand: deck.slice(0, PROGRAMMING_HAND_SIZE),

    registers: Array.from(
      { length: REGISTER_COUNT },
      () => null,
    ),

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
    registers.some(
      (registeredCard) => registeredCard?.id === card.id,
    )

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
export function registersAreFilled(
  registers: Registers,
): boolean {
  return registers.every((card) => card !== null)
}