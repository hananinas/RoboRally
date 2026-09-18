import { useEffect, useEffectEvent, useState } from 'react'

export default function useGameKeybinds(
  cards: readonly ProgramCard[],
  disabled: boolean,
  onPlaceCard: (card: ProgramCard, registerIndex: number) => void,
) {

    const [highlightedCardIndex, setHighlightedCardIndex] = useState(0)

    function highlightCard(cardIndex: number) {
      if (cards.length === 0) return

      const firstCardIndex = 0
      const lastCardIndex = cards.length - 1

      const boundedIndex = Math.max(
        firstCardIndex,
        Math.min(lastCardIndex, cardIndex),
      )

      setHighlightedCardIndex(boundedIndex)
    }

    const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
      if (disabled || cards.length === 0) return

      // browser shortcuts and text composition alone.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
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

    return highlightedCardIndex
}
