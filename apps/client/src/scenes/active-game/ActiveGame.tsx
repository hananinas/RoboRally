import './ActiveGame.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import useGameKeybinds from './components/useGameKeybinds.ts'
import { canProgram, type ProgramCard } from './gameState.ts'
import useGameConnection from './useGameConnection.ts'
import useOverlayLayout from './useOverlayLayout.ts'

function ActiveGame() {
  const { state, dispatch, submit } = useGameConnection()
  const {
    handBelowHud,
    handRef,
    hudContentRef,
    hudFits,
    overlayRef,
  } = useOverlayLayout(state.handVersion)
  const disabled = !canProgram(state)
  const handleRemove = (registerIndex: number) => dispatch({ type: 'remove', registerIndex })
  const handlePlaceCard = (card: ProgramCard, registerIndex: number) =>
    dispatch({ type: 'place', cardId: card.id, registerIndex })
  const hasHand = state.handVersion > 0
  const phase = state.playback.active ? 'EXECUTING' : state.phase
  const phaseLabel = phase === 'PROGRAMMING' ? 'Programming'
    : phase === 'EXECUTING' ? 'Executing' : 'Waiting'
  const status = !state.connected ? 'Not connected'
    : state.gameId === null ? 'Loading game…'
      : !hasHand && phase === 'PROGRAMMING' ? 'Waiting for cards…' : phaseLabel
  const registeredCardIds = new Set(
    state.registers.flatMap((card) => (card ? [card.id] : [])),
  )
  const [highlightedIndex, highlightCard, pendingDelete] = useGameKeybinds(
    state.hand, registeredCardIds, disabled, handlePlaceCard, handleRemove,
  )
  const overlayClassName = [
    'game-overlay',
    handBelowHud && 'game-overlay--hand-below-hud',
    hudFits && 'game-overlay--hud-fits',
  ].filter(Boolean).join(' ')

  return (
    <div className="game">
      {state.board && <BoardViewport board={state.board} robots={state.playback.robots} />}
      <div ref={overlayRef} className={overlayClassName}>
        <aside className="game-hud" aria-label="Game controls">
          <div ref={hudContentRef} className="game-hud__content">
            <PlayerPanel player={{ name: 'Player 1' }} />
            <RegisterPanel
              registers={state.registers}
              disabled={disabled}
              submission={state.submission}
              status={status}
              error={state.error}
              pendingDelete={pendingDelete}
              onRemove={handleRemove}
              onConfirm={submit}
            />
          </div>
        </aside>
        {hasHand && (
          <ProgrammingHand
            key={state.handVersion}
            containerRef={handRef}
            cards={state.hand}
            registeredCardIds={registeredCardIds}
            disabled={disabled}
            highlightedIndex={highlightedIndex}
            onHighlightCard={highlightCard}
            onSelect={(card) => dispatch({
              type: 'place', cardId: card.id, registerIndex: state.registers.indexOf(null),
            })}
            onPlaceCard={handlePlaceCard}
          />
        )}
      </div>
    </div>
  )
}

export default ActiveGame
