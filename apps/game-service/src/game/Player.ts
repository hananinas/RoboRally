import type { Instruction, PrivateProgram, PublicRegisters } from '@robo-rally/game-events'
import type { Card } from '@/game/Card'
import { Deck, HAND_SIZE } from '@/game/Deck'
import type { PlayerId } from '@/game/ids'
import type { Robot } from '@/game/Robot'

export class Player {
  private currentHand: readonly Card[] = []
  private completedCheckpoint = 0
  private publicRegisters: PublicRegisters = emptyRegisters()
  private currentProgram: PrivateProgram = Object.freeze([null, null, null, null, null])

  constructor(
    readonly id: PlayerId,
    readonly robot: Robot,
    private readonly deck: Deck,
  ) {}

  get hand(): readonly Card[] {
    return [...this.currentHand]
  }

  drawHand(): void {
    this.currentHand = this.deck.draw(HAND_SIZE)
  }

  // Moves the cards to the discard pile, removing any that are in hand.
  discard(cards: readonly Card[]): void {
    const discarded = new Set(cards.map((card) => card.id))
    this.currentHand = this.currentHand.filter((card) => !discarded.has(card.id))
    this.deck.discard(cards)
  }

  // Empties the hand without discarding, once its remaining cards are held elsewhere.
  clearHand(): void {
    this.currentHand = []
  }

  get lastCheckpoint(): number {
    return this.completedCheckpoint
  }

  get registers(): PublicRegisters {
    return this.publicRegisters
  }

  get program(): PrivateProgram {
    return this.currentProgram
  }

  updateRegisters(program: PrivateProgram): void {
    this.currentProgram = Object.freeze([...program]) as PrivateProgram
    this.publicRegisters = Object.freeze(program.map((card) =>
      Object.freeze({ status: card === null ? 'EMPTY' : 'HIDDEN' } as const),
    )) as PublicRegisters
  }

  revealRegister(index: number, instruction: Instruction): PublicRegisters {
    const registers = [...this.publicRegisters]
    registers[index] = Object.freeze({ status: 'REVEALED', instruction })
    this.publicRegisters = Object.freeze(registers) as PublicRegisters
    return this.publicRegisters
  }

  resetRegisters(): void {
    this.currentProgram = Object.freeze([null, null, null, null, null])
    this.publicRegisters = emptyRegisters()
  }

  completeCheckpoint(checkpointNumber: number): boolean {
    if (!Number.isSafeInteger(checkpointNumber) || checkpointNumber !== this.completedCheckpoint + 1) {
      return false
    }
    this.completedCheckpoint = checkpointNumber
    return true
  }
}

function emptyRegisters(): PublicRegisters {
  return Object.freeze([
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
  ])
}
