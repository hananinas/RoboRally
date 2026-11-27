import type { Card } from '@/domain/game/Card'
import { Deck, HAND_SIZE } from '@/domain/game/Deck'
import type { PlayerId } from '@/domain/game/ids'
import { Registers } from '@/domain/game/Registers'
import type { Robot } from '@/domain/game/Robot'

export class Player {
  #hand: readonly Card[] = []
  #registers = Registers.empty()
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

  updateRegisters(slots: readonly (Card | null)[]): void {
    this.#registers = Registers.of(slots)
  }

  discardProgram(): void {
    this.discard(this.#registers.program)
  }

  resetRegisters(): void {
    this.#registers = Registers.empty()
  }

  completeCheckpoint(checkpointNumber: number): boolean {
    if (!Number.isSafeInteger(checkpointNumber) || checkpointNumber !== this.completedCheckpoint + 1) {
      return false
    }
    this.completedCheckpoint = checkpointNumber
    return true
  }
}
