import type { ProgramCard as Card } from '../gameState.ts'
import ProgramCard from './ProgramCard.tsx'

type ProgrammingHandProps = {
  cards: readonly Card[]
  registeredCardIds: ReadonlySet<string>
  confirmed: boolean
  onSelect: (card: Card) => void
}

function ProgrammingHand({
  cards,
  registeredCardIds,
  confirmed,
  onSelect,
}: ProgrammingHandProps) {
  return (
    <section className="programming-hand" aria-label="Programming hand">
      {cards.map((card) => {
        const selected = registeredCardIds.has(card.id)

        return (
          <ProgramCard
            key={card.id}
            card={card}
            size="hand"
            selected={selected}
            disabled={selected || confirmed}
            onClick={() => onSelect(card)}
          />
        )
      })}
    </section>
  )
}

export default ProgrammingHand
