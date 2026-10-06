import type { Card } from '@/game/Card'
import type { RobotId } from '@/game/ids'
import { Direction, rotateDirection } from '@/game/spatial'

export class Robot {
  private currentDirection: Direction
  private programmedCards: readonly Card[] = []

  constructor(readonly id: RobotId, direction: Direction) {
    this.currentDirection = direction
  }

  get direction(): Direction {
    return this.currentDirection
  }

  get program(): readonly Card[] {
    return [...this.programmedCards]
  }

  setProgram(program: readonly Card[]): void {
    if (program.length !== 5) {
      throw new RangeError('A program must contain five cards')
    }
    this.programmedCards = [...program]
  }

  clearProgram(): void {
    this.programmedCards = []
  }

  getProgramCard(registerIndex: number): Card {
    if (!Number.isInteger(registerIndex) || registerIndex < 0 || registerIndex >= 5) {
      throw new RangeError('Register index must be between 0 and 4')
    }

    const card = this.programmedCards[registerIndex]
    if (!card) {
      throw new Error('Robot has no program')
    }
    return card
  }

  turn(quarterTurns: number): void {
    this.currentDirection = rotateDirection(this.currentDirection, quarterTurns)
  }
}
