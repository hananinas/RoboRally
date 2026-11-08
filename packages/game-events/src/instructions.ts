// Shared for execution/playback consistency; move effects to the server when they depend on game state.
export const instructions = {
  MOVE_1: { kind: 'move', steps: 1 },
  MOVE_2: { kind: 'move', steps: 2 },
  MOVE_3: { kind: 'move', steps: 3 },
  BACK_UP: { kind: 'move', steps: -1 },
  TURN_LEFT: { kind: 'turn', quarterTurns: 1 },
  TURN_RIGHT: { kind: 'turn', quarterTurns: 3 },
  U_TURN: { kind: 'turn', quarterTurns: 2 },
  AGAIN: { kind: 'repeat' },
} as const

export type Instruction = keyof typeof instructions
