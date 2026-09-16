import type { Card } from './Card.js'
import type { PlayerId } from './ids.js'
import type { Robot } from './Robot.js'

export class Player {
  private currentHand: readonly Card[]

  constructor(
    readonly id: PlayerId,
    readonly robot: Robot,
    hand: readonly Card[] = [],
  ) {
    this.currentHand = [...hand]
  }

  get hand(): readonly Card[] {
    return [...this.currentHand]
  }

  setHand(hand: readonly Card[]): void {
    this.currentHand = [...hand]
  }
}
