import type { ProgramCard as Card } from '../gameState.ts'

type ProgramCardProps = {
  card: Card
  size: 'hand' | 'register'
  selected?: boolean
  disabled?: boolean
  label?: string
  onClick: () => void
}

function ProgramCard({
  card,
  size,
  selected = false,
  disabled = false,
  label = card.label,
  onClick,
}: ProgramCardProps) {
  const selectedClassName = selected ? ' program-card--selected' : ''

  return (
    <button
      className={`program-card program-card--${size}${selectedClassName}`}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    />
  )
}

export default ProgramCard
