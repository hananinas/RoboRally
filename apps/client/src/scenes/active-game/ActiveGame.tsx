import DraggedCard from './components/DraggedCard.tsx'
import useCardDrag from './components/useCardDrag.ts'
import { useState } from 'react'
import './ActiveGame.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import OtherPlayersPanel from './components/OtherPlayersPanel.tsx'
import useGameKeybinds from './components/useGameKeybinds.ts'
import { 
  canProgram, 
  registersAreFilled, 
  getOtherPlayers,
  type ClientGameState , 
  type ProgramCard 
} from './gameState.ts'
import type useGameConnection from './useGameConnection.ts'
import LeaveGameButton from './components/LeaveGameButton.tsx'
import DisconnectVote from './components/DisconnectVote.tsx'
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
  const [handOrder, setHandOrder] = useState<{
    deal: readonly ProgramCard[]
    cards: readonly ProgramCard[]
  }>()
  const hand = handOrder?.deal === state.hand ? handOrder.cards : state.hand
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
  const handRetired = !state.handReady || state.phase !== 'PROGRAMMING' ||
    state.programmingTimer.status === 'CLOSED' || state.submission === 'accepted'
  const status = getGameStatus(state)
  const disconnectedNames = state.players.filter((player) => !player.connected).map((player) => player.username)
  const { active } = state.playback
  const activeCard = active && !('kind' in active) ? active : null
  const lastCheckpoint = state.assignment ? state.playback.checkpoints.get(state.assignment.playerId) ?? 0 : 0
  const player = state.players.find((candidate) => candidate.playerId === state.assignment?.playerId)
  const displayedRegisters = state.playbackProgram ?? state.registers
  const publicRegisters = player && (state.playbackRegisters?.get(player.playerId) ?? player.registers)
  const activeRegister = activeCard && activeCard.playerId === state.assignment?.playerId
    ? activeCard.registerIndex : null
  const playedCardIds = new Set(displayedRegisters.flatMap((card, index) =>
    card && publicRegisters?.[index]?.status === 'REVEALED' && index !== activeRegister ? [card.id] : [],
  ))
  const showWinner = isGameOver(state) && state.connected
  const robotColour = state.playback.robots.find((robot) => robot.robotId === state.assignment?.robotId)?.colour
  const registeredCardIds = new Set(
    state.registers.flatMap((card) => (card ? [card.id] : [])),
  )
  const [highlightedIndex, highlightCard, pendingDelete, awaitingSubmitConfirm] = useGameKeybinds(
    hand, registeredCardIds, disabled, handlePlaceCard, handleRemove,
    handleClearRegisters, handleUndo, handleRedo, submit, registersAreFilled(state.registers),
  )
  const cardDrag = useCardDrag({
    cards: hand,
    registers: state.registers,
    disabled,
    onPlace: handlePlaceCard,
    onRemove: handleRemove,
    onMove: handleMove,
    onReorder: (cards) => {
      setHandOrder({ deal: state.hand, cards })
      if (highlightedIndex !== null) highlightCard(cards.indexOf(hand[highlightedIndex]))
    },
  })
  return (
    <div className="game">
      {state.board && <BoardViewport board={state.board} robots={state.playback.robots} />}
      <div className="game-overlay">
        <aside className="game-hud" aria-label="Game controls">
          <div className="game-hud__content">
            <PlayerPanel
              player={{ name: username, lastCheckpoint }}
              robotColour={robotColour}
              checkpointCount={state.checkpointCount}
              onLeave={onLeave}
              leaveDisabled={leaving || !state.connected}
              onLogout={onLogout}
              onSettings={onSettings}
            />
            <RegisterPanel
              registers={displayedRegisters}
              activeRegister={activeRegister}
              playedCardIds={playedCardIds}
              disabled={disabled}
              submission={state.submission}
              locked={state.phase === 'PROGRAMMING' && !state.playback.active && state.submission === 'accepted'}
              status={status}
              localDeadline={game.localDeadline}
              error={state.error}
              pendingDelete={pendingDelete}
              awaitingSubmitConfirm={awaitingSubmitConfirm}
              cardDrag={cardDrag}
              onConfirm={submit}
            />
          </div>
        </aside>
        {state.phase && (
          <OtherPlayersPanel
            players={getOtherPlayers(state)}
            checkpointCount={state.checkpointCount}
            phase={state.playback.active ? 'EXECUTING' : state.phase}
            activeAction={activeCard}
            queuedActions={state.playback.pending.flatMap(({ action }) => 'kind' in action ? [] : [action])}
            paused={state.paused || !state.connected}
          />
        )}
        {hasHand && (
          <ProgrammingHand
            key={state.handVersion}
            cards={hand}
            retired={handRetired}
            registeredCardIds={registeredCardIds}
            playedCardIds={playedCardIds}
            disabled={disabled}
            highlightedIndex={highlightedIndex}
            onHighlightCard={highlightCard}
            cardDrag={cardDrag}
          />
        )}
        {cardDrag.drag && <DraggedCard drag={cardDrag.drag} />}
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
                    ? `${disconnectedNames.join(', ')} ${disconnectedNames.length === 1 ? 'has' : 'have'} disconnected`
                    : 'A player has disconnected'}
            </h2>
            <div className="disconnect-spinner" role="status"/>
            {state.connected && !state.aborted && state.winner === null && state.proposals.map((proposal) => {
              const target = state.players.find((member) => member.playerId === proposal.action.targetPlayerId)
              return target && !target.connected && (
                <DisconnectVote key={proposal.proposalId} proposal={proposal} username={target.username}
                  disabled={leaving} vote={game.vote} />
              )
            })}
            <LeaveGameButton onLeave={onLeave} disabled={leaving || !state.connected} />
          </div>
        </div>
      )}
    </div>
  )
}

export default ActiveGame
