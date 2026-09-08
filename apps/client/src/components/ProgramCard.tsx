import type { ProgramCard as Card } from '../gameState.ts'

type ProgramCardProps = {
  card: Card
  size: 'hand' | 'register'
}

function ProgramCard({ card, size }: ProgramCardProps) {
  return (
    <div className={`program-card program-card--${size}`}>
      <span className="visually-hidden">{card.label}</span>
    </div>
  )
}

export default ProgramCard
