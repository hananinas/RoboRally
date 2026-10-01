import { useEffect, useEffectEvent, useState } from 'react'
import type { ProgramCard } from '../gameState.ts'

export const KEYBINDS: readonly { keys: string; description: string }[] = [
  { keys: 'h / l', description: 'Move the highlight to the previous / next card' },
  { keys: '0 / $', description: 'Move the highlight to the first / last card' },
  { keys: '1-5', description: 'Place the highlighted card in the matching register' },
  { keys: 'd, then 1-5', description: 'Remove the card from the matching register' },
  { keys: 'dd', description: 'Clear all registers' },
  { keys: 'u', description: 'Undo the last register change' },
  { keys: 'Ctrl+R', description: 'Redo the last undone change' },
]

export default function useGameKeybinds(
  cards: readonly ProgramCard[],
  registeredCardIds: ReadonlySet<string>,
  disabled: boolean,
  onPlaceCard: (card: ProgramCard, registerIndex: number) => void,
  onRemoveCard: (registerIndex: number) => void,
  onClearRegisters: () => void,
  onUndo: () => void,
  onRedo: () => void,
) : [number, (cardIndex: number) => void, boolean]  {

    const [highlightedCardIndex, setHighlightedCardIndex] = useState(0)
    const [pendingDelete, setPendingDelete] = useState(false)

    function highlightFrom(startIndex: number, direction: number) {
      if (cards.length === 0) return

      let wrappedIndex = ((startIndex % cards.length) + cards.length) % cards.length

      for (let attempts = 0; attempts < cards.length; attempts++) {
        const card = cards[wrappedIndex]
        if (card && !registeredCardIds.has(card.id)) break
        wrappedIndex = ((wrappedIndex + direction) % cards.length + cards.length) % cards.length
      }

      setHighlightedCardIndex(wrappedIndex)
    }

    function highlightCard(cardIndex: number) {
      const direction = Math.sign(cardIndex - highlightedCardIndex) || 1
      highlightFrom(cardIndex, direction)
    }

    const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
      if (disabled || cards.length === 0) return

      if (event.ctrlKey && event.key === 'r') {
        event.preventDefault()
        setPendingDelete(false)
        onRedo()
        return
      }

      // browser shortcuts and text composition alone.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        return
      }

      if (pendingDelete) {
        setPendingDelete(false)

        if (event.key === 'd') {
          onClearRegisters()
        } else if (/^[1-5]$/.test(event.key)) {
          onRemoveCard(Number(event.key) - 1)
        }

        return
      }

      if (event.key === 'd') {
        setPendingDelete(true)
        return
      }

      if (event.key === 'u') {
        onUndo()
        return
      }

      if (event.key === 'h') {
        highlightCard(highlightedCardIndex - 1)
      }

      if (event.key === 'l') {
        highlightCard(highlightedCardIndex + 1)
      }

      if (event.key === '0') {
        highlightFrom(0, 1)
      }

      if (event.key === '$') {
        highlightFrom(cards.length - 1, -1)
      }

      if (/^[1-5]$/.test(event.key)) {
        const card = cards[highlightedCardIndex]
        const registerIndex = Number(event.key) - 1

        if (card) {
          onPlaceCard(card, registerIndex)
        }
      }
    })

    useEffect(() => {
      function listener(event: KeyboardEvent) {
        handleKeyDown(event)
      }

      window.addEventListener('keydown', listener)

      return () => {
        window.removeEventListener('keydown', listener)
      }
    }, [])

    return [highlightedCardIndex, highlightCard, pendingDelete]
}
