import type { ComponentProps } from 'react'
import type { Card, Instruction } from '@robo-rally/game-events'
import { cardPresentation } from './cardInstructions.ts'

type ProgramCardProps =
  ComponentProps<'button'> & {
    card: Card
    size: 'hand' | 'register'
    dragging?: boolean
    label?: string
  }


export function ProgramCardFace({ instruction, labelClass = '' }: {
  instruction: Instruction
  labelClass?: string
}) {
  const { icon, label } = cardPresentation[instruction]
  return (
    <>
      <img src={icon} alt="" className="program-card__icon" draggable={false} />
      <span className={`program-card__label ${labelClass}`}>{label}</span>
    </>
  )
}

function ProgramCard({
  card,
  size,
  dragging = false,
  label = cardPresentation[card.instruction].label,
  ...buttonProps
}: ProgramCardProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      aria-label={label}
      className={`program-card program-card--${size}${dragging ? ' program-card--dragging' : ''}`}
    >
      <ProgramCardFace instruction={card.instruction} />
    </button>
  )
}

export default ProgramCard
