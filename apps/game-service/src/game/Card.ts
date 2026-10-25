import type { Instruction } from '@robo-rally/game-events'
import type { CardId } from '@/game/ids'

export class Card {
  constructor(readonly id: CardId, readonly instruction: Instruction) {}
}
