import type { ProgramCard as Card } from '../gameState.ts'
import ProgramCard from './ProgramCard.tsx'

type ProgrammingHandProps = {
  cards: readonly Card[]
}

function ProgrammingHand({ cards }: ProgrammingHandProps) {
  return (
    <section className="programming-hand" aria-label="Programming hand">
      {cards.map((card) => (
        <ProgramCard key={card.id} card={card} size="hand" />
      ))}
    </section>
  )
}

export default ProgrammingHand
