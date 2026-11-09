import type { Instruction, PublicRegisters, RegisterOccupancy } from '@robo-rally/game-events'
import type { Card } from '@/game/Card'
import type { PlayerId } from '@/game/ids'
import type { Robot } from '@/game/Robot'

export class Player {
  private currentHand: readonly Card[]
  private completedCheckpoint = 0
  private publicRegisters: PublicRegisters = emptyRegisters()

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

  get registers(): PublicRegisters {
    return this.publicRegisters
  }

  updateRegisters(occupied: RegisterOccupancy): void {
    this.publicRegisters = Object.freeze(occupied.map((filled) =>
      Object.freeze({ status: filled ? 'HIDDEN' : 'EMPTY' } as const),
    )) as PublicRegisters
  }

  revealRegister(index: number, instruction: Instruction): PublicRegisters {
    const registers = [...this.publicRegisters]
    registers[index] = Object.freeze({ status: 'REVEALED', instruction })
    this.publicRegisters = Object.freeze(registers) as PublicRegisters
    return this.publicRegisters
  }

  resetRegisters(): void {
    this.publicRegisters = emptyRegisters()
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

function emptyRegisters(): PublicRegisters {
  return Object.freeze([
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
    Object.freeze({ status: 'EMPTY' }),
  ])
}
