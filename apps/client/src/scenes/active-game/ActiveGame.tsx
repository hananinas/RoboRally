import './ActiveGame.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import { canProgram } from './gameState.ts'
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
              onRemove={(registerIndex) => dispatch({ type: 'remove', registerIndex })}
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
            onSelect={(card) => dispatch({
              type: 'place', cardId: card.id, registerIndex: state.registers.indexOf(null),
            })}
            onDrop={(card, registerIndex) => dispatch({ type: 'place', cardId: card.id, registerIndex })}
          />
        )}
      </div>
    </div>
  )
}

export default ActiveGame
