import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
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
  onReorder: (cards: readonly Card[]) => void
}

const handDropMargin = 24

function measureDropZone(hand: HTMLElement) {
  const bounds = hand.getBoundingClientRect()
  const slots = [...hand.querySelectorAll('.programming-hand__slot:not([aria-hidden])')]
    .map((slot) => slot.getBoundingClientRect())
  const centers = slots.map((slot) => (slot.left + slot.right) / 2)

  return {
    left: (slots[0]?.left ?? bounds.left) - handDropMargin,
    right: (slots.at(-1)?.right ?? bounds.right) + handDropMargin,
    top: bounds.top - handDropMargin,
    bottom: bounds.bottom + handDropMargin,
    boundaries: centers.slice(1).map((center, index) => (center + centers[index]) / 2),
  }
}

function insertCard(cards: readonly Card[], card: Card, index: number) {
  const reordered = cards.filter((candidate) => candidate.id !== card.id)
  reordered.splice(index, 0, card)
  return reordered
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
  onReorder,
}: ProgrammingHandProps) {
  const dropZone = useRef<ReturnType<typeof measureDropZone> | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const available = cards.filter((card) => !registeredCardIds.has(card.id))

  function captureDropZone(event: PointerEvent<HTMLElement>) {
    if (disabled || event.button !== 0 || !event.isPrimary) return

    // Freeze the insertion points so animated cards cannot move the drop target.
    dropZone.current = measureDropZone(event.currentTarget)
  }

  const { drag, dragHandlers, isDragging } = useCardDrag({
    onTap: onSelect,
    getHandIndex: (x, y) => {
      const zone = dropZone.current
      if (!zone || x < zone.left || x > zone.right || y < zone.top || y > zone.bottom) return null

      return zone.boundaries.filter((boundary) => x >= boundary).length
    },
    onDrop: (card, registerIndex, handIndex) => {
      if (disabled || !available.includes(card)) return
      if (registerIndex !== null) {
        onPlaceCard(card, registerIndex)
      } else if (handIndex !== null && available[handIndex] !== card) {
        const reordered = insertCard(available, card, handIndex).values()
        onReorder(cards.map((candidate) =>
          registeredCardIds.has(candidate.id) ? candidate : reordered.next().value!,
        ))
      }
    },
  })

  useEffect(() => {
    if (highlightedIndex === null) return

    const card = cardRefs.current[highlightedIndex]
    if (card && document.activeElement !== card) card.focus({ preventScroll: true })
  }, [highlightedIndex])

  const fan = !drag?.moved
    ? available
    : drag.handIndex === null
      ? available.filter((card) => card.id !== drag.card.id)
      : insertCard(available, drag.card, drag.handIndex)

  const lastSlot = Math.max(0, fan.length - 1)
  const center = lastSlot / 2

  return (
    <>
      <section
        className="programming-hand"
        aria-label="Programming hand"
        onPointerDownCapture={captureDropZone}
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
                onClick={(event) => {
                  if (event.detail === 0) onSelect(card)
                }}
                {...dragHandlers(card)}
                onMouseEnter={() => onHighlightCard(index)}
                onFocus={() => onHighlightCard(index)}
              />
            </div>
          )
        })}
      </section>
      {drag && <DraggedCard drag={drag} />}
    </>
  )
}

export default ProgrammingHand
