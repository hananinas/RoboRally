import { useEffect, useRef, type CSSProperties } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'
import ProgramCard from './ProgramCard.tsx'
import type useCardDrag from './useCardDrag.ts'

type ProgrammingHandProps = {
  cards: readonly Card[]
  registeredCardIds: ReadonlySet<string>
  playedCardIds?: ReadonlySet<string>
  disabled: boolean
  highlightedIndex: number | null
  onHighlightCard: (cardIndex: number) => void
  cardDrag: Pick<ReturnType<typeof useCardDrag>, 'dragHandlers' | 'isDragging' | 'fan'>
}

function ProgrammingHand({
  cards,
  registeredCardIds,
  playedCardIds,
  disabled,
  highlightedIndex,
  onHighlightCard,
  cardDrag: { dragHandlers, isDragging, fan },
}: ProgrammingHandProps) {
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (highlightedIndex === null) return

    const card = cardRefs.current[highlightedIndex]
    if (card && document.activeElement !== card) card.focus({ preventScroll: true })
  }, [highlightedIndex])

  const lastSlot = Math.max(0, fan.length - 1)
  const center = lastSlot / 2

  return (
    <section
      className="programming-hand"
      aria-label="Programming hand"
      style={{ '--fan-intervals': Math.max(1, lastSlot) } as CSSProperties}
    >
      {cards.map((card, index) => {
        const slot = fan.indexOf(card)
        const registered = registeredCardIds.has(card.id)
        const offset = (slot === -1 ? Math.min(index, lastSlot) : slot) - center
        return (
          <div
            key={card.id}
            className="programming-hand__slot"
            aria-hidden={registered || undefined}
            data-outside-fan={slot === -1 || undefined}
            style={{
              zIndex: slot,
              '--fan-offset': offset,
              '--fan-angle': `${offset * 3.5}deg`,
              '--fan-drop': `${offset ** 2 * 0.1}rem`,
            } as CSSProperties}
          >
            <ProgramCard
              ref={(node) => { cardRefs.current[index] = node }}
              card={card}
              size="hand"
              data-played={playedCardIds?.has(card.id) || undefined}
              disabled={registered || disabled}
              dragging={isDragging(card)}
              {...dragHandlers(card)}
              onMouseEnter={() => onHighlightCard(index)}
              onFocus={() => onHighlightCard(index)}
            />
          </div>
        )
      })}
    </section>
  )
}

export default ProgrammingHand
