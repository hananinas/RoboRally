import type { ButtonHTMLAttributes } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'

type ProgramCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  card: Card
  size: 'hand' | 'register'
  selected?: boolean
  dragging?: boolean
  label?: string
}

function CardIcon({type} : {type: Card['type']}) {
  switch (type) {
    case 'MOVE_1':
      return (
        <svg 
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="program-card__icon"
        >
          <path d= "M12 19V5M6 11L6-6 6 6 "
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          />

        </svg>
      )
      case 'TURN_LEFT':
        return (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="program-card__icon"
          >
            <path d= "M19 12H7M12 7l-5 5 5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            />
          </svg>
        )
      case 'TURN_RIGHT':
        return (
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="program-card__icon"
          >
            <path d= "M5 12h12M12 7l5 5-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            />
          </svg>
        )
      default:
        return null
    }
  }
// Renders a blank program card.
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
    <button {...buttonProps}
      className={`program-card program-card--${size}${selectedClassName}${draggingClassName}`}
      type="button"
      aria-label={label}>
      <CardIcon type={card.type} />
      <span className="program-card__label">{label}</span>
    </button>
      
    
  )
}

export default ProgramCard
