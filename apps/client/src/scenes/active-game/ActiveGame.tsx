import './ActiveGame.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import useGameKeybinds from './components/useGameKeybinds.ts'
import { 
  canProgram, 
  registersAreFilled, 
  type ClientGameState , 
  type ProgramCard 
} from './gameState.ts'
import type useGameConnection from './useGameConnection.ts'
import useOverlayLayout from './useOverlayLayout.ts'

function getGameStatus(state: ClientGameState): string {
  if (!state.connected) return 'Not connected'
  if (state.assignment === null) return 'Loading game…'
  if (state.playback.active || state.phase === 'EXECUTING') return 'Executing'
  if (state.phase === 'PROGRAMMING') {
    if (!state.handReady) return 'Waiting for cards…'
    if (state.submission === 'accepted') return 'Program accepted · Waiting for other players'
    return 'Programming'
  }
  return 'Waiting'
}

function ActiveGame({ game, username, leaving, onLeave }: {
  game: ReturnType<typeof useGameConnection>
  username: string
  leaving: boolean
  onLeave: () => void
}) {
  const { state, dispatch, submit } = game
  const {
    handBelowHud,
    handRef,
    hudContentRef,
    hudFits,
    overlayRef,
  } = useOverlayLayout(state.handVersion)
  const disabled = leaving || !canProgram(state)
  const handleRemove = (registerIndex: number) => dispatch({ type: 'remove', registerIndex })
  const handlePlaceCard = (card: ProgramCard, registerIndex: number) =>
    dispatch({ type: 'place', cardId: card.id, registerIndex })
  const handleClearRegisters = () => dispatch({ type: 'clear' })
  const handleUndo = () => dispatch({ type: 'undo' })
  const handleRedo = () => dispatch({ type: 'redo' })
  const hasHand = state.handVersion > 0
  const status = getGameStatus(state)
  const registeredCardIds = new Set(
    state.registers.flatMap((card) => (card ? [card.id] : [])),
  )
  const [highlightedIndex, highlightCard, pendingDelete, awaitingSubmitConfirm] = useGameKeybinds(
    state.hand, registeredCardIds, disabled, handlePlaceCard, handleRemove,
    handleClearRegisters, handleUndo, handleRedo, submit, registersAreFilled(state.registers),
  )
  const overlayClassName = [
    'game-overlay',
    handBelowHud && 'game-overlay--hand-below-hud',
    hudFits && 'game-overlay--hud-fits',
  ].filter(Boolean).join(' ')
  const showDisconnectPopup = true //TEMP for testing

  return (
    <div className="game">
      {state.board && <BoardViewport board={state.board} robots={state.playback.robots} />}
      <div ref={overlayRef} className={overlayClassName}>
        <aside className="game-hud" aria-label="Game controls">
          <div ref={hudContentRef} className="game-hud__content">
            <PlayerPanel player={{ name: username }} onLeave={onLeave} leaveDisabled={leaving || !state.connected} />
            <RegisterPanel
              registers={state.registers}
              disabled={disabled}
              submission={state.submission}
              status={status}
              error={state.error}
              pendingDelete={pendingDelete}
              awaitingSubmitConfirm={awaitingSubmitConfirm}
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
      {showDisconnectPopup && (
        <div className="disconnect-overlay">
          <div className="disconnect-popup">
            <h2>A player has disconnected</h2>
          </div>
        </div>
      )}
    </div>
  )
}

export default ActiveGame
