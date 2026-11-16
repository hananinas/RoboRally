import { useState, type MouseEvent, type PointerEvent } from 'react'
import type { ProgramCard as Card, Registers } from '../gameState.ts'
import { animateCardTransfer } from './cardMotion.ts'

export type CardDrag = {
  card: Card
  pickupOffset: { x: number; y: number }
  x: number
  y: number
  moved: boolean
  overRegister: number | null
  handIndex: number | null
}

type DragGesture = CardDrag & {
  pointerId: number
  startX: number
  startY: number
  dropZone: ReturnType<typeof measureDropZone> | null
}

type CardDragOptions = {
  cards: readonly Card[]
  registers: Registers
  disabled: boolean
  onPlace: (card: Card, registerIndex: number) => void
  onRemove: (registerIndex: number) => void
  onMove: (fromIndex: number, toIndex: number) => void
  onReorder: (cards: readonly Card[]) => void
}

const handDropMargin = 24

function measureDropZone(hand: HTMLElement, fromRegister: boolean) {
  const bounds = hand.getBoundingClientRect()
  const slots = [...hand.querySelectorAll('.programming-hand__slot:not([aria-hidden])')]
    .map((slot) => slot.getBoundingClientRect())
  const centers = slots.map((slot) => (slot.left + slot.right) / 2)

  return {
    left: (slots[0]?.left ?? bounds.left) - handDropMargin,
    right: (slots.at(-1)?.right ?? bounds.right) + handDropMargin,
    top: bounds.top - handDropMargin,
    bottom: bounds.bottom + handDropMargin,
    boundaries: fromRegister
      ? centers
      : centers.slice(1).map((center, index) => (center + centers[index]) / 2),
  }
}

function arrangeHand(cards: readonly Card[], card: Card, index: number | null) {
  const reordered = cards.filter((candidate) => candidate.id !== card.id)
  if (index !== null) reordered.splice(index, 0, card)
  return reordered
}

const dragThreshold = 4

function registerAtPoint(x: number, y: number): number | null {
  const target = document.elementFromPoint(x, y)
  const register = target?.closest<HTMLElement>('[data-register-index]')
  const registerIndex = Number(register?.dataset.registerIndex)

  return Number.isInteger(registerIndex) ? registerIndex : null
}

function hasMoved(drag: DragGesture, x: number, y: number): boolean {
  return drag.moved || Math.hypot(x - drag.startX, y - drag.startY) >= dragThreshold
}

function useCardDrag({ cards, registers, disabled, onPlace, onRemove, onMove, onReorder }: CardDragOptions) {
  const [gesture, setGesture] = useState<DragGesture | null>(null)
  const registerOf = (card: Card) => registers.findIndex((registered) => registered?.id === card.id)
  const available = cards.filter((card) => registerOf(card) === -1)

  function dropTarget(zone: DragGesture['dropZone'], x: number, y: number) {
    const overRegister = registerAtPoint(x, y)
    const insideHand = zone && x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom
    const handIndex = overRegister === null && insideHand
      ? zone.boundaries.filter((boundary) => x >= boundary).length
      : null
    return { overRegister, handIndex }
  }

  function onTap(card: Card) {
    if (disabled) return

    const fromRegister = registerOf(card)
    if (fromRegister === -1) onPlace(card, registers.indexOf(null))
    else onRemove(fromRegister)
  }

  function onDrop(card: Card, registerIndex: number | null, handIndex: number | null) {
    if (disabled) return

    const fromRegister = registerOf(card)
    if (registerIndex !== null) {
      if (fromRegister === -1) onPlace(card, registerIndex)
      else if (fromRegister !== registerIndex) onMove(fromRegister, registerIndex)
      return
    }

    if (fromRegister !== -1) onRemove(fromRegister)
    if (handIndex === null || !cards.includes(card) || available[handIndex] === card) return

    const reordered = arrangeHand(available, card, handIndex).values()
    onReorder(cards.map((candidate) =>
      candidate.id === card.id || registerOf(candidate) === -1 ? reordered.next().value! : candidate,
    ))
  }

  function startDrag(card: Card, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return

    // Freeze insertion points so the opening gap cannot move its own drop target.
    const hand = event.currentTarget.closest('.game-overlay')?.querySelector<HTMLElement>('.programming-hand')
    const dropZone = hand ? measureDropZone(hand, registerOf(card) !== -1) : null
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      card: cards.find((candidate) => candidate.id === card.id) ?? card,
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
      dropZone,
      overRegister: registerAtPoint(event.clientX, event.clientY),
      handIndex: null,
    })
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const { pointerId, clientX: x, clientY: y } = event
    if (gesture?.pointerId !== pointerId || !event.currentTarget.hasPointerCapture(pointerId)) return

    const target = dropTarget(gesture.dropZone, x, y)

    setGesture((current) => {
      if (!current || current.pointerId !== pointerId || !hasMoved(current, x, y)) return current

      const pickupOffset = current.moved ? current.pickupOffset : {
        x: current.pickupOffset.x + current.startX - x,
        y: current.pickupOffset.y + current.startY - y,
      }

      return {
        ...current,
        x,
        y,
        pickupOffset,
        moved: true,
        ...target,
      }
    })
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const { clientX: x, clientY: y } = event
    const moved = hasMoved(gesture, x, y)
    animateCardTransfer(event.currentTarget, () => {
      setGesture(null)
      if (!moved) {
        onTap(gesture.card)
        return
      }

      const { overRegister, handIndex } = dropTarget(gesture.dropZone, x, y)
      onDrop(gesture.card, overRegister, handIndex)
    }, moved)
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (gesture?.pointerId !== event.pointerId) return

    if (gesture.moved) {
      animateCardTransfer(event.currentTarget, () => setGesture(null), true)
    } else {
      setGesture(null)
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

  const drag = !disabled && gesture && cards.includes(gesture.card) ? gesture : null
  const fan = drag?.moved ? arrangeHand(available, drag.card, drag.handIndex) : available

  function isDragging(card: Card): boolean {
    return drag?.card.id === card.id && drag.moved
  }

  return { drag, dragHandlers, isDragging, fan }
}

export default useCardDrag
