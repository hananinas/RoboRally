import type { ButtonHTMLAttributes } from 'react'

import type { ProgramCard as Card } from '../gameState.ts'

import arrowLeft from './svg/arrow-left.svg'
import arrowRight from './svg/arrow-right.svg'
import arrowUTurn from './svg/arrow-turn-arround.svg'
import arrowUp1 from './svg/arrow-up-1.svg'
import arrowUp2 from './svg/arrow-up-2.svg'

type ProgramCardProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    card: Card
    size: 'hand' | 'register'
    selected?: boolean
    dragging?: boolean
    label?: string
}

// Renders the icon for a programming card.
function CardIcon({ type }: { type: Card['type'] }) {
  const icons: Record<Card['type'], string> = {
    MOVE_1: arrowUp1,
    MOVE_2: arrowUp2,
    MOVE_3: arrowUp2,

    TURN_LEFT: arrowLeft,
    TURN_RIGHT: arrowRight,
    U_TURN: arrowUTurn,

    AGAIN: arrowUp1,
    BACK_UP: arrowUp1,
    POWER_UP: arrowUp1,
  }

  return (
    <img
      src={icons[type]}
      alt=""
      aria-hidden="true"
      className="program-card__icon"
    />
  )
}

// Renders a programming card.
function ProgramCard({
  card,
  size,
  selected = false,
  dragging = false,
  label = card.label,
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
      className={
        `program-card program-card--${size}` +
        selectedClassName +
        draggingClassName
      }
    >
      <CardIcon type={card.type} />

      <span className="program-card__label">
        {label}
      </span>
    </button>
  )
}

export default ProgramCard