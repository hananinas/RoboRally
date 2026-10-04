import type { Card } from '@/game/Card'
import type { PlayerId } from '@/game/ids'
import type { Robot } from '@/game/Robot'

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
