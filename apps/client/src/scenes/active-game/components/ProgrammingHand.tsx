import { useEffect, useRef } from 'react'
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

// Renders and manages the draggable hand.
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
    if (card && document.activeElement !== card) card.focus()
  }, [highlightedIndex])

  return (
    <section
      className="programming-hand"
      aria-label="Programming hand"
    >
      {cards.map((card, index) => {
        const selected = registeredCardIds.has(card.id)

        return (
          <ProgramCard
            key={card.id}
            ref={(node) => { cardRefs.current[index] = node }}
            card={card}
            size="hand"
            selected={selected}
            data-played={playedCardIds?.has(card.id) || undefined}
            disabled={selected || disabled}
            dragging={isDragging(card)}
            onClick={(event) => {
              if (event.detail === 0) onSelect(card)
            }}
            {...dragHandlers(card)}
            onMouseEnter={() => onHighlightCard(index)}
            onFocus={() => onHighlightCard(index)}
          />
        )
      })}
      {drag && <DraggedCard drag={drag} />}
    </section>
  )
}

export default ProgrammingHand
