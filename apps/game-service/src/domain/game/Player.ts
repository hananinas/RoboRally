import type { Card } from '@/domain/game/Card'
import { Deck, HAND_SIZE } from '@/domain/game/Deck'
import type { PlayerId } from '@/domain/game/ids'
import type { Robot } from '@/domain/game/Robot'
import type { UnsignedInteger } from '@/numbers'

// Five register slots. A null slot is a register not yet filled; five filled slots are a program.
export type Registers = readonly [Card | null, Card | null, Card | null, Card | null, Card | null]

export class Player {
  #hand: readonly Card[] = []
  #registers: Registers = Object.freeze([null, null, null, null, null])
  private completedCheckpoint = 0

  constructor(
    readonly id: PlayerId,
    readonly robot: Robot,
    private readonly deck: Deck,
  ) {}

  get hand(): readonly Card[] {
    return [...this.#hand]
  }

  drawHand(): void {
    this.#hand = this.deck.draw(HAND_SIZE)
  }

  // Moves the cards to the discard pile, removing any that are in hand.
  discard(cards: readonly Card[]): void {
    const discarded = new Set(cards.map((card) => card.id))
    this.#hand = this.#hand.filter((card) => !discarded.has(card.id))
    this.deck.discard(cards)
  }

  // Empties the hand without discarding, once its remaining cards are held elsewhere.
  clearHand(): void {
    this.#hand = []
  }

  get lastCheckpoint(): number {
    return this.completedCheckpoint
  }

  get registers(): Registers {
    return this.#registers
  }

  updateRegisters(registers: Registers): void {
    this.#registers = Object.freeze([...registers]) as Registers
  }

  cardInRegister(index: UnsignedInteger): Card {
    if (index >= this.#registers.length) {
      throw new RangeError('Register index must be between 0 and 4')
    }
    const card = this.#registers[index]
    if (card === null) throw new Error(`Register ${index} holds no card`)
    return card
  }

  discardProgram(): void {
    this.discard(this.#registers.filter((card): card is Card => card !== null))
  }

  resetRegisters(): void {
    this.#registers = Object.freeze([null, null, null, null, null])
  }

  completeCheckpoint(checkpointNumber: number): boolean {
    if (!Number.isSafeInteger(checkpointNumber) || checkpointNumber !== this.completedCheckpoint + 1) {
      return false
    }
    this.completedCheckpoint = checkpointNumber
    return true
  }
}
