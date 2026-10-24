import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import '../src/scenes/active-game/ActiveGame.css'
import BoardViewport from '../src/scenes/active-game/components/BoardViewport.tsx'
import PlayerPanel from '../src/scenes/active-game/components/PlayerPanel.tsx'
import ProgrammingHand from '../src/scenes/active-game/components/ProgrammingHand.tsx'
import RegisterPanel from '../src/scenes/active-game/components/RegisterPanel.tsx'
import useGameKeybinds from '../src/scenes/active-game/components/useGameKeybinds.ts'
import { DEMO_BOARD, DEMO_ROBOTS } from '../src/scenes/active-game/board/demoBoard.ts'
import {
  useRobotPlayback,
  type ResolvedRobotAction,
} from '../src/scenes/active-game/board/robotPlayback.ts'
import {
  moveCard,
  placeCard,
  registersAreFilled,
  removeCard,
  type ProgramCard,
  type Registers,
} from '../src/scenes/active-game/gameState.ts'
import useOverlayLayout from '../src/scenes/active-game/useOverlayLayout.ts'

export type BoardHarnessApi = {
  enqueue: (actions: readonly ResolvedRobotAction[]) => void
}

declare global {
  interface Window {
    boardFixture: BoardHarnessApi
  }
}

const hand: readonly ProgramCard[] = Array.from({ length: 9 }, (_, index) => ({
  id: `board-fixture-card-${index}`,
  instruction: index % 2 === 0 ? 'MOVE_1' : 'TURN_LEFT',
}))

export default function BoardHarness() {
  const { robots, enqueue } = useRobotPlayback(DEMO_ROBOTS)
  const [registers, setRegisters] = useState<Registers>(() => Array(5).fill(null))
  const [registersPast, setRegistersPast] = useState<readonly Registers[]>([])
  const [registersFuture, setRegistersFuture] = useState<readonly Registers[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const { handBelowHud, handRef, hudContentRef, hudFits, overlayRef } = useOverlayLayout()

  useEffect(() => {
    window.boardFixture = { enqueue: (actions) => actions.forEach(enqueue) }
  }, [enqueue])

  const registeredCardIds = new Set(registers.flatMap((card) => card ? [card.id] : []))
  const handlePlaceCard = (card: ProgramCard, index: number) => {
    const next = placeCard(registers, card, index)
    if (next === registers) return
    setRegistersPast((past) => [...past, registers])
    setRegistersFuture([])
    setRegisters(next)
  }
  const handleRemove = (index: number) => {
    const next = removeCard(registers, index)
    if (next === registers) return
    setRegistersPast((past) => [...past, registers])
    setRegistersFuture([])
    setRegisters(next)
  }
  const handleMove = (fromIndex: number, toIndex: number) => {
    const next = moveCard(registers, fromIndex, toIndex)
    if (next === registers) return
    setRegistersPast((past) => [...past, registers])
    setRegistersFuture([])
    setRegisters(next)
  }
  const handleClearRegisters = () => {
    if (registers.every((card) => card === null)) return
    setRegistersPast((past) => [...past, registers])
    setRegistersFuture([])
    setRegisters(Array(5).fill(null))
  }
  const handleUndo = () => {
    if (registersPast.length === 0) return
    const previous = registersPast[registersPast.length - 1]
    setRegistersPast((past) => past.slice(0, -1))
    setRegistersFuture((future) => [...future, registers])
    setRegisters(previous)
  }
  const handleRedo = () => {
    if (registersFuture.length === 0) return
    const next = registersFuture[registersFuture.length - 1]
    setRegistersFuture((future) => future.slice(0, -1))
    setRegistersPast((past) => [...past, registers])
    setRegisters(next)
  }
  const handleSubmit = () => setConfirmed(true)
  const [highlightedIndex, highlightCard, pendingDelete, awaitingSubmitConfirm] = useGameKeybinds(
    hand, registeredCardIds, confirmed, handlePlaceCard, handleRemove,
    handleClearRegisters, handleUndo, handleRedo, handleSubmit, registersAreFilled(registers),
  )
  const overlayClassName = [
    'game-overlay',
    handBelowHud && 'game-overlay--hand-below-hud',
    hudFits && 'game-overlay--hud-fits',
  ].filter(Boolean).join(' ')

  return (
    <div className="game">
      <BoardViewport board={DEMO_BOARD} robots={robots} />
      <div ref={overlayRef} className={overlayClassName}>
        <aside className="game-hud" aria-label="Game controls">
          <div ref={hudContentRef} className="game-hud__content">
            <PlayerPanel player={{ name: 'Board fixture player', lastCheckpoint: 0 }} checkpointCount={0} />
            <RegisterPanel
              registers={registers}
              activeRegister={null}
              disabled={confirmed}
              pendingDelete={pendingDelete}
              awaitingSubmitConfirm={awaitingSubmitConfirm}
              submission={confirmed ? 'accepted' : 'idle'}
              status="Programming"
              error={null}
              onRemove={handleRemove}
              onMove={handleMove}
              onConfirm={handleSubmit}
            />
          </div>
        </aside>
        <ProgrammingHand
          containerRef={handRef}
          cards={hand}
          registeredCardIds={registeredCardIds}
          disabled={confirmed}
          highlightedIndex={highlightedIndex}
          onHighlightCard={highlightCard}
          onSelect={(card) => setRegisters((current) => placeCard(current, card, current.indexOf(null)))}
          onPlaceCard={handlePlaceCard}
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<BoardHarness />)
