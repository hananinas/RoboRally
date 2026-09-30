import type { Instruction } from '@robo-rally/game-events'
import type { CardId } from './ids.js'

export class Card {
  constructor(readonly id: CardId, readonly instruction: Instruction) {}
}
