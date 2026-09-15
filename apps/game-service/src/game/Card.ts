import type { CardId } from './ids.js'

export abstract class Card {
  constructor(readonly id: CardId) {}
}

export class Move1 extends Card {}

export class TurnLeft extends Card {}
