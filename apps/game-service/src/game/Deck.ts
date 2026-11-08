import { randomUUID } from 'node:crypto'
import type { Instruction } from '@robo-rally/game-events'
import { Card } from '@/game/Card'

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

  constructor(cards: readonly Card[] = []) {
    this.drawPile = [...cards]
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

  // Drawing at random is equivalent to shuffling and drawing from the top.
  // When the draw pile runs out, the discard pile becomes the new draw pile.
  draw(count: number, random: () => number = Math.random): Card[] {
    const drawn = this.drawFromPile(count, random)
    if (drawn.length < count && this.discardPile.length > 0) {
      this.drawPile.push(...this.discardPile)
      this.discardPile = []
      drawn.push(...this.drawFromPile(count - drawn.length, random))
    }
    return drawn
  }

  private drawFromPile(count: number, random: () => number): Card[] {
    const drawn: Card[] = []
    while (drawn.length < count && this.drawPile.length > 0) {
      const index = Math.min(Math.floor(random() * this.drawPile.length), this.drawPile.length - 1)
      drawn.push(...this.drawPile.splice(index, 1))
    }
    return drawn
  }
}

export function createHand(
  deck: Deck,
  random: () => number = Math.random,
  size: number = HAND_SIZE,
): Card[] {
  return deck.draw(size, random)
}
