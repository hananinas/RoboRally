export type CardId = string

export type CardAction =
  | Readonly<{
      type: 'move-forward'
      steps: 1
    }>
  | Readonly<{
      type: 'turn-left'
    }>

export type CardExecutionContext = Readonly<{
  moveForward(steps: 1): void
  turnLeft(): void
}>

export abstract class Card {
  protected constructor(
    readonly id: CardId,
    readonly action: CardAction,
  ) {}

  abstract execute(context: CardExecutionContext): void
}

export class MoveForward extends Card {
  constructor(id: CardId) {
    super(id, { type: 'move-forward', steps: 1 })
  }

  execute(context: CardExecutionContext): void {
    context.moveForward(1)
  }
}

export class TurnLeft extends Card {
  constructor(id: CardId) {
    super(id, { type: 'turn-left' })
  }

  execute(context: CardExecutionContext): void {
    context.turnLeft()
  }
}

// Move1 is the name used by the v0 UML for the one-space forward card.
export { MoveForward as Move1 }
