import type { ButtonHTMLAttributes } from 'react'
import type { Card } from '@robo-rally/game-events'

import { cardPresentation } from './cardInstructions.ts'

type ProgramCardProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    card: Card
    size: 'hand' | 'register'
    selected?: boolean
    dragging?: boolean
    label?: string
  }


function ProgramCard({
  card,
  size,
  selected = false,
  dragging = false,
  label = cardPresentation[card.instruction].label,
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
        src={cardPresentation[card.instruction].icon}
        alt=""
        className="program-card__icon"
        draggable={false}
      />

      <span className="program-card__label">
        {cardPresentation[card.instruction].label}
      </span>
    </button>
  )
}

export default ProgramCard
