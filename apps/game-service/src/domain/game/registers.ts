import type { Instruction } from '@robo-rally/game-events'

// What one of a player's five registers shows to the table.
export type RegisterView =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'hidden' }>
  | Readonly<{ kind: 'revealed'; instruction: Instruction }>

// Registers are played in order: everything before the current register has been played, everything
// after it has not, and the current one depends on whether this robot has acted yet.
function hasPlayed(index: number, registerIndex: number, hasActed: boolean): boolean {
  if (index < registerIndex) return true
  if (index > registerIndex) return false
  return hasActed
}

export function registerViews(
  registers: readonly (Readonly<{ instruction: Instruction }> | null)[],
  registerIndex: number,
  hasActed: boolean,
): readonly RegisterView[] {
  return registers.map((card, index): RegisterView => {
    if (card === null) return { kind: 'empty' }
    if (!hasPlayed(index, registerIndex, hasActed)) return { kind: 'hidden' }
    return { kind: 'revealed', instruction: card.instruction }
  })
}
