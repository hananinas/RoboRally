import { randomUUID } from 'node:crypto'
import type { Instruction } from '@robo-rally/game-events'
import { Card } from '@/domain/game/Card'
import type { CardId } from '@/domain/game/ids'

export const HAND_SIZE = 9

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

export function createDeckCards(): Card[] {
  return DECK_COMPOSITION.flatMap(([instruction, count]) =>
    Array.from({ length: count }, () => new Card(randomUUID(), instruction)),
  )
}

export class Deck {
  private drawPile: Card[]
  private discardPile: Card[] = []

  constructor(cards: readonly Card[]) {
    this.drawPile = [...cards]
  }

  // A player's private deck: fresh copies of the template cards with new ids.
  static fromTemplate(template: readonly Card[]): Deck {
    return new Deck(template.map((card) => new Card(randomUUID(), card.instruction)))
  }

  get size(): number {
    return this.drawPile.length
  }

  get discarded(): number {
    return this.discardPile.length
  }

  get isEmpty(): boolean {
    return this.drawPile.length === 0 && this.discardPile.length === 0
  }

  add(cards: readonly Card[]): void {
    this.drawPile.push(...cards)
  }

  discard(cards: readonly Card[]): void {
    this.discardPile.push(...cards)
  }

  // Removes a card from the game entirely (e.g. a trashed Spam).
  remove(cardId: CardId): Card | undefined {
    for (const pile of [this.drawPile, this.discardPile]) {
      const index = pile.findIndex((card) => card.id === cardId)
      if (index >= 0) return pile.splice(index, 1)[0]
    }
    return undefined
  }

  // Drawing at random is equivalent to shuffling and drawing from the top, so
  // "draw the top card" is simply draw(1).
  draw(count: number): Card[] {
    const drawn = this.drawFromPile(count)
    // If draw pile was exhausted, replenish from discard pile and draw the rest.
    if (drawn.length < count && this.discardPile.length > 0) {
      this.drawPile.push(...this.discardPile)
      this.discardPile = []
      drawn.push(...this.drawFromPile(count - drawn.length))
    }
    return drawn
  }

  private drawFromPile(count: number): Card[] {
    const drawn: Card[] = []
    while (drawn.length < count && this.drawPile.length > 0) {
      const index = Math.min(Math.floor(Math.random() * this.drawPile.length), this.drawPile.length - 1)
      drawn.push(...this.drawPile.splice(index, 1))
    }
    return drawn
  }
}
