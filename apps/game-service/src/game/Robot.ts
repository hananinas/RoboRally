import type { Card } from '@/game/Card'
import type { RobotSpriteId } from '@robo-rally/game-events'
import type { RobotId } from '@/game/ids'
import { Direction, rotateDirection } from '@/game/spatial'
import type { UnsignedInteger } from '@/numbers'

export const ROBOT_COLOURS = [
  '#c74f4f', // 1. Red
  '#4D8DEB', // 2. Blue
  '#4CAF70', // 3. Green
  '#E5C04D', // 4. Yellow
  '#A66BE0', // 5. Purple
  '#E58B4D', // 6. Orange
  '#4DC9C0', // 7. Cyan
  '#E56FA8', // 8. Pink
  '#8B6548', // 9. Brown
  '#A0A0A0', // 10. Grey
]

export class Robot {
  private currentDirection: Direction
  private programmedCards: readonly Card[] = []

  constructor(
    readonly id: RobotId,
    direction: Direction,
    readonly colour: string = ROBOT_COLOURS[0],
    readonly robotSpriteId: RobotSpriteId = 'fork-clamp1',
  ) {
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

  getProgramCard(registerIndex: UnsignedInteger): Card {
    if (registerIndex >= 5) {
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
