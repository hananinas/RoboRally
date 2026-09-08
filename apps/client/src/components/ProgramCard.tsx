import type { MouseEventHandler, PointerEventHandler } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'

type ProgramCardProps = {
  card: Card
  size: 'hand' | 'register'
  selected?: boolean
  disabled?: boolean
  dragging?: boolean
  label?: string
  onClick: MouseEventHandler<HTMLButtonElement>
  onPointerDown?: PointerEventHandler<HTMLButtonElement>
  onPointerMove?: PointerEventHandler<HTMLButtonElement>
  onPointerUp?: PointerEventHandler<HTMLButtonElement>
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>
  onLostPointerCapture?: PointerEventHandler<HTMLButtonElement>
}

function ProgramCard({
  card,
  size,
  selected = false,
  disabled = false,
  dragging = false,
  label = card.label,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: ProgramCardProps) {
  const selectedClassName = selected ? ' program-card--selected' : ''
  const draggingClassName = dragging ? ' program-card--dragging' : ''

  return (
    <button
      className={`program-card program-card--${size}${selectedClassName}${draggingClassName}`}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
    />
  )
}

export default ProgramCard
