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
  { keys: '?', description: 'Toggle this keybinds menu' },
  { keys: ':w Enter', description: 'Submit the program, after confirming' },
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
  onSubmit: () => void,
  canSubmit: boolean,
) : [number | null, (cardIndex: number) => void, boolean, boolean]  {

    const [highlightedCardIndex, setHighlightedCardIndex] = useState<number | null>(null)
    const [pendingSequence, setPendingSequence] = useState<'none' | 'delete' | 'colon' | 'colon-w'>('none')

    // Clear a dangling multi-key sequence when programming ends or a new hand arrives,
    // so a sequence left incomplete (e.g. submitting by mouse mid-"dd") can't bleed into the next round.
    useEffect(() => {
      setPendingSequence('none')
    }, [disabled, cards])

    function highlightNextUnregistered(startIndex: number, direction: number) {
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
      const direction = Math.sign(cardIndex - (highlightedCardIndex ?? 0)) || 1
      highlightNextUnregistered(cardIndex, direction)
    }

    const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.matches('input, textarea, select, [contenteditable]')
      ) {
        return
      }

      if (event.key === '?') {
        const popover = document.querySelector<HTMLElement>('.game-menu__popover')
        popover?.togglePopover()
        popover?.querySelector<HTMLElement>('summary')?.focus()
        return
      }

      if (disabled || cards.length === 0) return

      if (event.ctrlKey && event.key === 'r') {
        event.preventDefault()
        setPendingSequence('none')
        onRedo()
        return
      }

      // browser shortcuts and text composition alone.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        return
      }

      if (pendingSequence === 'colon') {
        setPendingSequence(event.key === 'w' ? 'colon-w' : 'none')
        return
      }

      if (pendingSequence === 'colon-w') {
        setPendingSequence('none')
        if (event.key === 'Enter' && canSubmit && window.confirm('Submit your program?')) {
          onSubmit()
        }
        return
      }

      if (event.key === ':') {
        setPendingSequence('colon')
        return
      }

      if (pendingSequence === 'delete') {
        setPendingSequence('none')

        if (event.key === 'd') {
          onClearRegisters()
        } else if (/^[1-5]$/.test(event.key)) {
          onRemoveCard(Number(event.key) - 1)
        }

        return
      }

      if (event.key === 'd') {
        setPendingSequence('delete')
        return
      }

      if (event.key === 'u') {
        onUndo()
        return
      }

      if (event.key === 'h') {
        highlightCard((highlightedCardIndex ?? 0) - 1)
      }

      if (event.key === 'l') {
        highlightCard((highlightedCardIndex ?? 0) + 1)
      }

      if (event.key === '0') {
        highlightNextUnregistered(0, 1)
      }

      if (event.key === '$') {
        highlightNextUnregistered(cards.length - 1, -1)
      }

      if (/^[1-5]$/.test(event.key)) {
        const card = cards[highlightedCardIndex ?? 0]
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

    const pendingDelete = pendingSequence === 'delete'
    const awaitingSubmitConfirm = canSubmit && pendingSequence === 'colon-w'

    return [
      highlightedCardIndex,
      highlightCard,
      pendingDelete,
      awaitingSubmitConfirm
    ]
}
