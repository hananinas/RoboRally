import type { RobotSpriteId } from '@robo-rally/game-events'
import type { RobotId } from '@/domain/game/ids'
import { Direction, rotateDirection } from '@/domain/game/spatial'

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
  #direction: Direction

  constructor(
    readonly id: RobotId,
    direction: Direction,
    readonly colour: string,
    readonly robotSpriteId: RobotSpriteId,
  ) {
    this.#direction = direction
  }

  get direction(): Direction {
    return this.#direction
  }

  turn(quarterTurns: number): void {
    this.#direction = rotateDirection(this.#direction, quarterTurns)
  }
}
