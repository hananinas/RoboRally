import { useEffect, useRef, type CSSProperties } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'
import DraggedCard from './DraggedCard.tsx'
import ProgramCard from './ProgramCard.tsx'
import useCardDrag from './useCardDrag.ts'

type ProgrammingHandProps = {
  cards: readonly Card[]
  registeredCardIds: ReadonlySet<string>
  playedCardIds?: ReadonlySet<string>
  disabled: boolean
  highlightedIndex: number | null
  onHighlightCard: (cardIndex: number) => void
  onSelect: (card: Card) => void
  onPlaceCard: (card: Card, registerIndex: number) => void
}

function ProgrammingHand({
  cards,
  registeredCardIds,
  playedCardIds,
  disabled,
  highlightedIndex,
  onHighlightCard,
  onSelect,
  onPlaceCard,
}: ProgrammingHandProps) {
  const { drag, dragHandlers, isDragging } = useCardDrag({
    onTap: onSelect,
    onDrop: (card, registerIndex) => {
      if (registerIndex !== null) onPlaceCard(card, registerIndex)
    },
  })
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (highlightedIndex === null) return

    const card = cardRefs.current[highlightedIndex]
    if (card && document.activeElement !== card) card.focus({ preventScroll: true })
  }, [highlightedIndex])

  const count = cards.filter((card) => !registeredCardIds.has(card.id)).length
  const lastSlot = Math.max(0, count - 1)
  const center = lastSlot / 2
  // Keep registered cards mounted so they can animate back into the fan.
  const slots = []
  let nextSlot = 0
  for (const card of cards) {
    const registered = registeredCardIds.has(card.id)
    slots.push({ card, registered, offset: Math.min(nextSlot, lastSlot) - center })
    if (!registered) nextSlot += 1
  }

  return (
    <>
      <section
        className="programming-hand"
        aria-label="Programming hand"
        style={{ '--fan-intervals': Math.max(1, lastSlot) } as CSSProperties}
      >
        {slots.map(({ card, registered, offset }, index) => (
          <div
            key={card.id}
            className="programming-hand__slot"
            aria-hidden={registered || undefined}
            style={{
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
              onClick={(event) => {
                if (event.detail === 0) onSelect(card)
              }}
              {...dragHandlers(card)}
              onMouseEnter={() => onHighlightCard(index)}
              onFocus={() => onHighlightCard(index)}
            />
          </div>
        ))}
      </section>
      {drag && <DraggedCard drag={drag} />}
    </>
  )
}

export default ProgrammingHand
