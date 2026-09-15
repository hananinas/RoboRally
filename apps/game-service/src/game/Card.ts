export type CardId = string

export type CardAction =
  | Readonly<{
      type: 'move-forward'
      steps: 1
    }>
  | Readonly<{
      type: 'turn-left'
    }>

export abstract class Card {
  protected constructor(
    readonly id: CardId,
    readonly action: CardAction,
  ) {}
}

export class MoveForward extends Card {
  constructor(id: CardId) {
    super(id, { type: 'move-forward', steps: 1 })
  }
}

export class TurnLeft extends Card {
  constructor(id: CardId) {
    super(id, { type: 'turn-left' })
  }
}

// Move1 is the name used by the v0 UML for the one-space forward card.
export { MoveForward as Move1 }
