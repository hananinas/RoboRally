import { useState, type PointerEvent } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'

export type CardDrag = {
  card: Card
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
  overRegister: number | null
}

type CardDragOptions = {
  onTap: (card: Card) => void
  onDrop: (card: Card, registerIndex: number | null) => void
}

const dragThreshold = 4

function registerAtPoint(x: number, y: number): number | null {
  const target = document.elementFromPoint(x, y)
  const register = target?.closest<HTMLElement>('[data-register-index]')
  const registerIndex = Number(register?.dataset.registerIndex)

  return Number.isInteger(registerIndex) ? registerIndex : null
}

function hasMoved(drag: CardDrag, x: number, y: number): boolean {
  return drag.moved || Math.hypot(x - drag.startX, y - drag.startY) >= dragThreshold
}

function useCardDrag({ onTap, onDrop }: CardDragOptions) {
  const [drag, setDrag] = useState<CardDrag | null>(null)

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
      overRegister: registerAtPoint(event.clientX, event.clientY),
    })
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    setDrag((currentDrag) => {
      if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
        return currentDrag
      }

      const moved = hasMoved(currentDrag, event.clientX, event.clientY)

      return {
        ...currentDrag,
        x: event.clientX,
        y: event.clientY,
        moved,
        overRegister: moved
          ? registerAtPoint(event.clientX, event.clientY)
          : currentDrag.overRegister,
      }
    })
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    if (hasMoved(drag, event.clientX, event.clientY)) {
      onDrop(drag.card, registerAtPoint(event.clientX, event.clientY))
    } else {
      onTap(drag.card)
    }

    setDrag(null)
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null)
  }

  function dragHandlers(card: Card) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => startDrag(card, event),
      onPointerMove: moveDrag,
      onPointerUp: finishDrag,
      onPointerCancel: cancelDrag,
      onLostPointerCapture: cancelDrag,
    }
  }

  function isDragging(card: Card): boolean {
    return drag?.card.id === card.id && drag.moved
  }

  return { drag, dragHandlers, isDragging }
}

export default useCardDrag
