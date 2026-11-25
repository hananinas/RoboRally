import type { Instruction } from '@robo-rally/game-events'

import backDown from './svg/back-down.svg'
import arrowLeft from './svg/arrow-left.svg'
import arrowRight from './svg/arrow-right.svg'
import arrowUp1 from './svg/arrow-up-1.svg'
import arrowUp2 from './svg/arrow-up-2.svg'
import arrowUp3 from './svg/arrow-up-3.svg'
import repeat from './svg/repeat.svg'
import uTurn from './svg/u-turn.svg'

export const cardPresentation: Record<Instruction, { label: string; icon: string }> = {
  MOVE_1: { label: 'Move 1', icon: arrowUp1 },
  MOVE_2: { label: 'Move 2', icon: arrowUp2 },
  MOVE_3: { label: 'Move 3', icon: arrowUp3 },
  BACK_UP: { label: 'Back Up', icon: backDown },
  TURN_LEFT: { label: 'Turn Left', icon: arrowLeft },
  TURN_RIGHT: { label: 'Turn Right', icon: arrowRight },
  U_TURN: { label: 'U-Turn', icon: uTurn },
  AGAIN: { label: 'Again', icon: repeat },
  SANDBOX_ROUTINE: { label: 'Sandbox Routine', icon: arrowUp1 },
  WEASEL_ROUTINE: { label: 'Weasel Routine', icon: uTurn },
  SPEED_ROUTINE: { label: 'Speed Routine', icon: arrowUp3 },
  REPEAT_ROUTINE: { label: 'Repeat Routine', icon: repeat },
}
