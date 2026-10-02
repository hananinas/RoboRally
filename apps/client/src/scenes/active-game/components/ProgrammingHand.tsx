import { useEffect, useRef, useState, type PointerEvent, type Ref } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'
import ProgramCard from './ProgramCard.tsx'

type CardDrag = {
  card: Card
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
  overRegister: number | null
}

type ProgrammingHandProps = {
  containerRef: Ref<HTMLElement>
  cards: readonly Card[]
  registeredCardIds: ReadonlySet<string>
  disabled: boolean
  highlightedIndex: number
  onHighlightCard: (cardIndex: number) => void
  onSelect: (card: Card) => void
  onPlaceCard: (card: Card, registerIndex: number) => void
}

const dragThreshold = 4

// Finds an open register at a point.
function registerAtPoint(x: number, y: number): number | null {
  const target = document.elementFromPoint(x, y)
  const register = target?.closest<HTMLElement>('[data-register-index]')
  const registerIndex = Number(register?.dataset.registerIndex)

  return Number.isInteger(registerIndex) ? registerIndex : null
}

// Renders and manages the draggable hand.
function ProgrammingHand({
  containerRef,
  cards,
  registeredCardIds,
  disabled,
  highlightedIndex,
  onHighlightCard,
  onSelect,
  onPlaceCard,
}: ProgrammingHandProps) {
  const [drag, setDrag] = useState<CardDrag | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    cardRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex])

  // Starts pointer tracking.
  function startDrag(card: Card, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      overRegister: null,
    })
  }

  // Updates the drag preview.
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    setDrag((currentDrag) => {
      if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
        return currentDrag
      }

      const moved =
        currentDrag.moved ||
        Math.hypot(
          event.clientX - currentDrag.startX,
          event.clientY - currentDrag.startY,
        ) >= dragThreshold

      return {
        ...currentDrag,
        x: event.clientX,
        y: event.clientY,
        moved,
        overRegister: moved
          ? registerAtPoint(event.clientX, event.clientY)
          : null,
      }
    })
  }

  // Places or selects the card.
  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    const moved =
      drag.moved ||
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
        dragThreshold

    if (moved) {
      const registerIndex = registerAtPoint(event.clientX, event.clientY)
      if (registerIndex !== null) onPlaceCard(drag.card, registerIndex)
    } else {
      onSelect(drag.card)
    }

    setDrag(null)
  }

  // Clears an interrupted drag.
  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null)
  }

  return (
    <section
      ref={containerRef}
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
            disabled={selected || disabled}
            dragging={drag?.card.id === card.id && drag.moved}
            onClick={(event) => {
              if (event.detail === 0) onSelect(card)
            }}
            onPointerDown={(event) => startDrag(card, event)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onMouseEnter={() => onHighlightCard(index)}
            onFocus={() => onHighlightCard(index)}
          />
        )
      })}
      {drag?.moved && (
        <div
          className={`program-card program-card--${drag.overRegister === null ? 'hand' : 'register'} dragged-card`}
          style={{ left: drag.x, top: drag.y }}
        />
      )}
    </section>
  )
}

export default ProgrammingHand
