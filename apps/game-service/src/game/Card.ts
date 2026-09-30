import type { CardId } from './ids.js'

export abstract class Card {
  constructor(readonly id: CardId) {}
}

export class Move1 extends Card {}
export class Move2 extends Card{}
export class Move3 extends Card{}

export class BackUp extends Card{}

export class TurnRight extends Card{}
export class TurnLeft extends Card {}
export class UTurn extends Card {}

