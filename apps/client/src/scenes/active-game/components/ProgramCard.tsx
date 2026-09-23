import type { ButtonHTMLAttributes } from 'react'
import type {
  Card,
  Instruction,
} from '@robo-rally/game-events'

import arrowLeft from './svg/arrow-left.svg'
import arrowUp1 from './svg/arrow-up-1.svg'

type ProgramCardProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    card: Card
    size: 'hand' | 'register'
    selected?: boolean
    dragging?: boolean
    label?: string
  }

function instructionLabel(instruction: Instruction): string {
  switch (instruction) {
    case 'MOVE_1':
      return 'Move 1'
    case 'TURN_LEFT':
      return 'Turn Left'
  }
}
const icons : Record <Instruction, string> ={
  MOVE_1: arrowUp1,
  TURN_LEFT: arrowLeft,
}

// Renders a programming card.
function ProgramCard({
  card,
  size,
  selected = false,
  dragging = false,
  label = instructionLabel(card.instruction),
  ...buttonProps
}: ProgramCardProps) {
  const selectedClassName = selected
    ? ' program-card--selected'
    : ''

  const draggingClassName = dragging
    ? ' program-card--dragging'
    : ''

  return (
    <button
      {...buttonProps}
      type="button"
      aria-label={label}
      className={
        `program-card program-card--${size}` +
        selectedClassName +
        draggingClassName
      }
    >
      <img
        src={icons[card.instruction]}
        alt=""
        className="program-card__icon"
        draggable={false}
      />
      <span className="program-card__label">
        {instructionLabel(card.instruction)}
      </span>
    </button>
  )
}

export default ProgramCard