import type { ButtonHTMLAttributes } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'

type ProgramCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
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
  label = card.label,
  ...buttonProps
}: ProgramCardProps) {
  const selectedClassName = selected ? ' program-card--selected' : ''
  const draggingClassName = dragging ? ' program-card--dragging' : ''

  return (
    <button
      {...buttonProps}
      className={`program-card program-card--${size}${selectedClassName}${draggingClassName}`}
      type="button"
      aria-label={label}
    />
  )
}

export default ProgramCard
