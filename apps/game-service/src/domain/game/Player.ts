import type { Card } from '@/domain/game/Card'
import { Deck, HAND_SIZE } from '@/domain/game/Deck'
import { cardSnapshot, type PlayerSnapshot } from '@/domain/game/GameSnapshot'
import type { PlayerId } from '@/domain/game/ids'
import { Registers } from '@/domain/game/Registers'
import type { Robot } from '@/domain/game/Robot'
import { orientationOf, type Position } from '@/domain/game/spatial'

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

  snapshot(position: Position): PlayerSnapshot {
    return {
      playerId: this.id,
      robotId: this.robot.id,
      robotColour: this.robot.colour,
      robotSpriteId: this.robot.robotSpriteId,
      position: { x: position.x, y: position.y },
      orientation: orientationOf(this.robot.direction),
      lastCheckpoint: this.completedCheckpoint,
      hand: this.currentHand.map(cardSnapshot),
      deck: this.deck.snapshot,
    }
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
