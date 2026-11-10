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
import WinnerPopup from './components/WinnerPopup.tsx'


function isGameOver(state: ClientGameState): boolean {
  return state.winner !== null && !state.playback.active
}

function getGameStatus(state: ClientGameState): string {
  if (!state.connected) return 'Not connected'
  if (state.assignment === null) return 'Loading game…'
  if (isGameOver(state)) return 'Game over'
  if (state.paused) {
    const names = state.players.filter((player) => !player.connected).map((player) => player.username)
    return names.length > 0 ? `Game paused · Waiting for ${names.join(', ')}` : 'Game paused'
  }
  if (state.playback.active || state.phase === 'EXECUTING') return 'Executing'
  if (state.phase === 'PROGRAMMING') {
    if (!state.handReady) return 'Waiting for cards…'
    if (state.submission === 'accepted') return 'Program accepted · Waiting for other players'
    return 'Programming'
  }
  return 'Waiting'
}

function ActiveGame({ game, username, leaving, onLeave, onLogout, onSettings }: {
  game: ReturnType<typeof useGameConnection>
  username: string
  leaving: boolean
  onLeave: () => void
  onLogout: () => void
  onSettings: () => void
}) {
  const { state, dispatch, submit } = game
  const {
    handBelowHud,
    handRef,
    hudContentRef,
    hudFits,
    overlayRef,
  } = useOverlayLayout(state.handVersion)
  const disabled = leaving || state.paused || !canProgram(state)
  const handleRemove = (registerIndex: number) => dispatch({ type: 'remove', registerIndex })
  const handleMove = (fromIndex: number, toIndex: number) =>
    dispatch({ type: 'move', fromIndex, toIndex })
  const handlePlaceCard = (card: ProgramCard, registerIndex: number) =>
    dispatch({ type: 'place', cardId: card.id, registerIndex })
  const handleClearRegisters = () => dispatch({ type: 'clear' })
  const handleUndo = () => dispatch({ type: 'undo' })
  const handleRedo = () => dispatch({ type: 'redo' })
  const hasHand = state.handVersion > 0
  const status = getGameStatus(state)
  const disconnectedNames = state.players.filter((player) => !player.connected).map((player) => player.username)
  const player = state.players.find((candidate) => candidate.playerId === state.assignment?.playerId)
  const showWinner = isGameOver(state) && state.connected
  const robotColour = state.playback.robots.find((robot) => robot.robotId === state.assignment?.robotId)?.colour
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

  return (
    <div className="game">
      {state.board && <BoardViewport board={state.board} robots={state.playback.robots} />}
      <div ref={overlayRef} className={overlayClassName}>
        <aside className="game-hud" aria-label="Game controls">
          <div ref={hudContentRef} className="game-hud__content">
            <PlayerPanel
              player={{ name: username, lastCheckpoint: player?.lastCheckpoint ?? 0 }}
              robotColour={robotColour}
              checkpointCount={state.checkpointCount}
              onLeave={onLeave}
              leaveDisabled={leaving || !state.connected}
              onLogout={onLogout}
              onSettings={onSettings}
            />
            <RegisterPanel
              registers={state.playbackProgram ?? state.registers}
              activeRegister={state.playback.active?.registerIndex ?? null}
              disabled={disabled}
              submission={state.submission}
              status={status}
              programmingTimer={state.programmingTimer}
              serverTime={state.serverTime}
              error={state.error}
              pendingDelete={pendingDelete}
              awaitingSubmitConfirm={awaitingSubmitConfirm}
              onRemove={handleRemove}
              onMove={handleMove}
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
            {showWinner && (
        <WinnerPopup
          winnerName={state.winner?.username ?? ''}
          isWinner={state.winner?.playerId === state.assignment?.playerId}
          leaving={leaving}
          onLeave={onLeave}
        />
      )}
      {!showWinner && (state.paused || !state.connected) && (
        <div className="disconnect-overlay">
          <div className="disconnect-popup">
            <h2>{!state.connected
                  ? 'Connection to server lost'
                  : disconnectedNames.length > 0
                    ? `${disconnectedNames.join(', ')} has disconnected`
                    : 'A player has disconnected'}
            </h2>
            <div className="disconnect-spinner" role="status"/>
            <button
              className="game-menu__button game-menu__button--leave"
              type="button"
              onClick={onLeave}
              disabled={leaving || !state.connected}
            >
              Leave game
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ActiveGame
