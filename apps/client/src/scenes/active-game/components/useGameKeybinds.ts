import { useEffect, useEffectEvent, useState } from 'react'
import type { ProgramCard } from '../gameState.ts'

export default function useGameKeybinds(
  cards: readonly ProgramCard[],
  registeredCardIds: ReadonlySet<string>,
  disabled: boolean,
  onPlaceCard: (card: ProgramCard, registerIndex: number) => void,
  onRemoveCard: (registerIndex: number) => void,
) : [number, (cardIndex: number) => void, boolean]  {

    const [highlightedCardIndex, setHighlightedCardIndex] = useState(0)
    const [pendingDelete, setPendingDelete] = useState(false)

    function highlightCard(cardIndex: number) {
      if (cards.length === 0) return

      const direction = Math.sign(cardIndex - highlightedCardIndex) || 1
      let wrappedIndex = ((cardIndex % cards.length) + cards.length) % cards.length

      for (let attempts = 0; attempts < cards.length; attempts++) {
        const card = cards[wrappedIndex]
        if (card && !registeredCardIds.has(card.id)) break
        wrappedIndex = ((wrappedIndex + direction) % cards.length + cards.length) % cards.length
      }

      setHighlightedCardIndex(wrappedIndex)
    }

    const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
      if (disabled || cards.length === 0) return

      // browser shortcuts and text composition alone.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        return
      }

      if (pendingDelete) {
        setPendingDelete(false)

        if (/^[1-5]$/.test(event.key)) {
          onRemoveCard(Number(event.key) - 1)
        }

        return
      }

      if (event.key === 'd') {
        setPendingDelete(true)
        return
      }

      if (event.key === 'h') {
        highlightCard(highlightedCardIndex - 1)
      }

      if (event.key === 'l') {
        highlightCard(highlightedCardIndex + 1)
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
