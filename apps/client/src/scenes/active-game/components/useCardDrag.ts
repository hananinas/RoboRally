import { useState, type MouseEvent, type PointerEvent } from 'react'
import type { ProgramCard as Card } from '../gameState.ts'
import { animateCardTransfer } from './cardMotion.ts'

export type CardDrag = {
  card: Card
  pointerId: number
  startX: number
  startY: number
  pickupOffset: { x: number; y: number }
  x: number
  y: number
  moved: boolean
  overRegister: number | null
  handIndex: number | null
}

type CardDragOptions = {
  onTap: (card: Card) => void
  onDrop: (card: Card, registerIndex: number | null, handIndex: number | null) => void
  getHandIndex?: (x: number, y: number) => number | null
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

function useCardDrag({ onTap, onDrop, getHandIndex }: CardDragOptions) {
  const [drag, setDrag] = useState<CardDrag | null>(null)

  function dropTarget(x: number, y: number) {
    const overRegister = registerAtPoint(x, y)
    const handIndex = overRegister === null ? getHandIndex?.(x, y) ?? null : null
    return { overRegister, handIndex }
  }

  function startDrag(card: Card, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return

    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pickupOffset: {
        x: bounds.left + bounds.width / 2 - event.clientX,
        y: bounds.top + bounds.height / 2 - event.clientY,
      },
      x: event.clientX,
      y: event.clientY,
      moved: false,
      ...dropTarget(event.clientX, event.clientY),
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
        ...(moved && !currentDrag.moved && {
          pickupOffset: {
            x: currentDrag.pickupOffset.x + currentDrag.startX - event.clientX,
            y: currentDrag.pickupOffset.y + currentDrag.startY - event.clientY,
          },
        }),
        ...(moved && dropTarget(event.clientX, event.clientY)),
      }
    })
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    const moved = hasMoved(drag, event.clientX, event.clientY)
    const { overRegister, handIndex } = dropTarget(event.clientX, event.clientY)
    animateCardTransfer(event.currentTarget, () => {
      setDrag(null)
      if (moved) onDrop(drag.card, overRegister, handIndex)
      else onTap(drag.card)
    }, moved)
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag?.pointerId !== event.pointerId) return

    if (drag.moved) {
      animateCardTransfer(event.currentTarget, () => setDrag(null), true)
    } else {
      setDrag(null)
    }
  }

  function dragHandlers(card: Card) {
    return {
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0) animateCardTransfer(event.currentTarget, () => onTap(card))
      },
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
