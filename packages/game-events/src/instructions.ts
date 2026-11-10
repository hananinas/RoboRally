// Shared for execution/playback consistency; move effects to the server when they depend on game state.
export const effects = {
  MOVE_1: { kind: 'move', steps: 1 },
  MOVE_2: { kind: 'move', steps: 2 },
  MOVE_3: { kind: 'move', steps: 3 },
  BACK_UP: { kind: 'move', steps: -1 },
  TURN_LEFT: { kind: 'turn', quarterTurns: 1 },
  TURN_RIGHT: { kind: 'turn', quarterTurns: 3 },
  U_TURN: { kind: 'turn', quarterTurns: 2 },
} as const

// What a register actually did.
export type ResolvedInstruction = keyof typeof effects

// What a card says. AGAIN has no effect of its own; the server resolves it to a ResolvedInstruction.
export type Instruction = ResolvedInstruction | 'AGAIN'
