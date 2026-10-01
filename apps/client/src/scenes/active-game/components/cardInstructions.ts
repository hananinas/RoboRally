import type { Instruction } from '@robo-rally/game-events'

import backDown from './svg/back-down.svg'
import arrowLeft from './svg/arrow-left.svg'
import arrowRight from './svg/arrow-right.svg'
import arrowUp1 from './svg/arrow-up-1.svg'
import arrowUp2 from './svg/arrow-up-2.svg'
import arrowUp3 from './svg/arrow-up-3.svg'
import uTurn from './svg/u-turn.svg'

export const instructionLabels: Record<Instruction, string> = {
  MOVE_1: 'Move 1',
  MOVE_2: 'Move 2',
  MOVE_3: 'Move 3',
  BACK_UP: 'Back Up',
  TURN_LEFT: 'Turn Left',
  TURN_RIGHT: 'Turn Right',
  U_TURN: 'U-Turn',
}

export const instructionIcons: Record<Instruction, string> = {
  MOVE_1: arrowUp1,
  MOVE_2: arrowUp2,
  MOVE_3: arrowUp3,
  BACK_UP: backDown,
  TURN_LEFT: arrowLeft,
  TURN_RIGHT: arrowRight,
  U_TURN: uTurn,
}

export function instructionLabel(instruction: Instruction): string {
  return instructionLabels[instruction]
}