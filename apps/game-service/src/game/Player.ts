import type { Card } from '@/game/Card'
import type { PlayerId } from '@/game/ids'
import type { Robot } from '@/game/Robot'

export class Player {
  private currentHand: readonly Card[]
  private completedCheckpoint = 0

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

  get lastCheckpoint(): number {
    return this.completedCheckpoint
  }

  completeCheckpoint(checkpointNumber: number): boolean {
    if (!Number.isSafeInteger(checkpointNumber) || checkpointNumber !== this.completedCheckpoint + 1) {
      return false
    }
    this.completedCheckpoint = checkpointNumber
    return true
  }

  setHand(hand: readonly Card[]): void {
    this.currentHand = [...hand]
  }
}
