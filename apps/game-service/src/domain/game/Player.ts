import type { PrivateProgram } from '@robo-rally/game-events'
import type { Card } from '@/domain/game/Card'
import { Deck, HAND_SIZE } from '@/domain/game/Deck'
import type { PlayerId } from '@/domain/game/ids'
import type { Robot } from '@/domain/game/Robot'

export class Player {
  private currentHand: readonly Card[] = []
  private completedCheckpoint = 0
  private currentProgram: PrivateProgram = Object.freeze([null, null, null, null, null])

  constructor(
    readonly id: PlayerId,
    readonly robot: Robot,
    private readonly deck: Deck,
  ) {}

  get hand(): readonly Card[] {
    return [...this.currentHand]
  }

  drawHand(): void {
    this.currentHand = this.deck.draw(HAND_SIZE)
  }

  // Moves the cards to the discard pile, removing any that are in hand.
  discard(cards: readonly Card[]): void {
    const discarded = new Set(cards.map((card) => card.id))
    this.currentHand = this.currentHand.filter((card) => !discarded.has(card.id))
    this.deck.discard(cards)
  }

  // Empties the hand without discarding, once its remaining cards are held elsewhere.
  clearHand(): void {
    this.currentHand = []
  }

  get lastCheckpoint(): number {
    return this.completedCheckpoint
  }

  get program(): PrivateProgram {
    return this.currentProgram
  }

  updateRegisters(program: PrivateProgram): void {
    this.currentProgram = Object.freeze([...program]) as PrivateProgram
  }

  resetRegisters(): void {
    this.currentProgram = Object.freeze([null, null, null, null, null])
  }

  completeCheckpoint(checkpointNumber: number): boolean {
    if (!Number.isSafeInteger(checkpointNumber) || checkpointNumber !== this.completedCheckpoint + 1) {
      return false
    }
    this.completedCheckpoint = checkpointNumber
    return true
  }
}
