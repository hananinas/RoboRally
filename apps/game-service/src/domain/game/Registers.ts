import type { Instruction } from '@robo-rally/game-events'
import type { Card } from '@/domain/game/Card'
import type { UnsignedInteger } from '@/numbers'

export const REGISTER_COUNT = 5

// What one of a player's five registers shows to the public
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

// A player's five register slots. A null slot is a register not yet filled; five filled slots are a
// program. 
export class Registers {
  // Positional and nullable because the wire program and deadline completion both need the gaps.
  readonly slots: readonly (Card | null)[]

  private static readonly EMPTY = new Registers([null, null, null, null, null])

  private constructor(slots: readonly (Card | null)[]) {
    this.slots = Object.freeze([...slots])
  }

  static empty(): Registers {
    return Registers.EMPTY
  }

  static of(slots: readonly (Card | null)[]): Registers {
    if (slots.length !== REGISTER_COUNT) {
      throw new RangeError(`Expected ${REGISTER_COUNT} registers, got ${slots.length}`)
    }
    return new Registers(slots)
  }

  cardAt(index: UnsignedInteger): Card {
    if (index >= REGISTER_COUNT) {
      throw new RangeError(`Register index must be between 0 and ${REGISTER_COUNT - 1}`)
    }
    const card = this.slots[index]
    if (card === null) throw new Error(`Register ${index} holds no card`)
    return card
  }

  get program(): readonly Card[] {
    const cards = this.slots.filter((card): card is Card => card !== null)
    if (cards.length !== REGISTER_COUNT) {
      throw new RangeError(`A program needs ${REGISTER_COUNT} registers, ${cards.length} are filled`)
    }
    return cards
  }

  publicView(registerIndex: number, hasActed: boolean): readonly RegisterView[] {
    return this.slots.map((card, index): RegisterView => {
      if (card === null) return { kind: 'empty' }
      if (!hasPlayed(index, registerIndex, hasActed)) return { kind: 'hidden' }
      return { kind: 'revealed', instruction: card.instruction }
    })
  }
}
