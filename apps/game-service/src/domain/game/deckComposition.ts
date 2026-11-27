import type { Instruction } from '@robo-rally/game-events'

// Programming cards in each player's private deck (RoboRally 2017).
// Power Up is omitted until energy is implemented.
const DECK_COMPOSITION: readonly (readonly [Instruction, number])[] = [
  ['MOVE_1', 4],
  ['MOVE_2', 3],
  ['MOVE_3', 1],
  ['BACK_UP', 1],
  ['TURN_RIGHT', 4],
  ['TURN_LEFT', 4],
  ['U_TURN', 1],
  ['AGAIN', 1],
]

export const DECK_INSTRUCTIONS: readonly Instruction[] = Object.freeze(
  DECK_COMPOSITION.flatMap(([instruction, count]) => Array.from({ length: count }, () => instruction)),
)
