import { useState } from 'react'
import './ActiveGame.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import RobotSprite from './components/RobotSprite.tsx'
import {
  createMockGameState,
  placeCard,
  registersAreFilled,
  removeCard,
  type ClientGameState,
  type ProgramCard,
} from './gameState.ts'
import useOverlayLayout from './useOverlayLayout.ts'
import { DEMO_BOARD } from './board/demoBoard.ts'
import { BOARD_CONFIG } from './board/boardConfig.ts'
import { tileCentre } from './board/boardMath.ts'

// Applies a valid card placement.
function withPlacedCard(
  state: ClientGameState,
  card: ProgramCard,
  registerIndex: number,
): ClientGameState {
  if (state.confirmed) return state

  const registers = placeCard(state.registers, card, registerIndex)
  return registers === state.registers ? state : { ...state, registers }
}

// Renders the active game scene.
function ActiveGame() {
  const [gameState, setGameState] = useState(createMockGameState)
  const [robot, setRobot] = useState({
    x:10,
    y:7,
    direction:'NORTH' as const,
  })
  const {
    handBelowHud,
    handRef,
    hudContentRef,
    hudFits,
    overlayRef,
  } = useOverlayLayout()

  // Fills the next open register.
  function selectCard(card: ProgramCard) {
    setGameState((currentState) =>
      withPlacedCard(currentState, card, currentState.registers.indexOf(null)),
    )
  }

  // Fills the chosen register.
  function dropCard(card: ProgramCard, registerIndex: number) {
    setGameState((currentState) =>
      withPlacedCard(currentState, card, registerIndex),
    )
  }

  // Clears one register.
  function clearRegister(registerIndex: number) {
    setGameState((currentState) => {
      if (currentState.confirmed) return currentState

      const registers = removeCard(currentState.registers, registerIndex)

      return registers === currentState.registers
        ? currentState
        : { ...currentState, registers }
    })
  }

  // Locks a complete program.
  function confirmProgram() {
    setGameState((currentState) =>
      currentState.confirmed || !registersAreFilled(currentState.registers)
        ? currentState
        : { ...currentState, confirmed: true },
    )
  }
  
  const robotPosition = tileCentre(
    {
      x: robot.x,
      y: robot.y,
    },
    DEMO_BOARD,
    BOARD_CONFIG,
  )

  const registeredCardIds = new Set(
    gameState.registers.flatMap((card) => (card ? [card.id] : [])),
  )
  const overlayClassName = [
    'game-overlay',
    handBelowHud && 'game-overlay--hand-below-hud',
    hudFits && 'game-overlay--hud-fits',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="game">
      <BoardViewport board={DEMO_BOARD} robot={robot} />
      <div ref={overlayRef} className={overlayClassName}>
        <aside className="game-hud" aria-label="Game controls">
          <div ref={hudContentRef} className="game-hud__content">
            <PlayerPanel player={gameState.player} />
            <RegisterPanel
              registers={gameState.registers}
              confirmed={gameState.confirmed}
              onRemove={clearRegister}
              onConfirm={confirmProgram}
            />
          </div>
        </aside>
        {gameState.phase === 'programming' && (
          <ProgrammingHand
            containerRef={handRef}
            cards={gameState.hand}
            registeredCardIds={registeredCardIds}
            confirmed={gameState.confirmed}
            onSelect={selectCard}
            onDrop={dropCard}
          />
        )}
      </div>
    </div>
  )
}

export default ActiveGame
