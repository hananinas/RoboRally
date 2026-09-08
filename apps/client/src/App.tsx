import { useState } from 'react'
import './App.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import {
  createMockGameState,
  placeCard,
  registersAreFilled,
  removeCard,
  type ProgramCard,
} from './gameState.ts'

function App() {
  const [gameState, setGameState] = useState(createMockGameState)

  function selectCard(card: ProgramCard) {
    setGameState((currentState) => {
      if (currentState.confirmed) return currentState

      const registerIndex = currentState.registers.indexOf(null)
      const registers = placeCard(currentState.registers, card, registerIndex)

      return registers === currentState.registers
        ? currentState
        : { ...currentState, registers }
    })
  }

  function clearRegister(registerIndex: number) {
    setGameState((currentState) => {
      if (currentState.confirmed) return currentState

      const registers = removeCard(currentState.registers, registerIndex)

      return registers === currentState.registers
        ? currentState
        : { ...currentState, registers }
    })
  }

  function confirmProgram() {
    setGameState((currentState) =>
      currentState.confirmed || !registersAreFilled(currentState.registers)
        ? currentState
        : { ...currentState, confirmed: true },
    )
  }

  const registeredCardIds = new Set(
    gameState.registers.flatMap((card) => (card ? [card.id] : [])),
  )

  return (
    <div className="game">
      <BoardViewport />
      <div className="game-overlay">
        <aside className="game-hud" aria-label="Game controls">
          <PlayerPanel player={gameState.player} />
          <RegisterPanel
            registers={gameState.registers}
            confirmed={gameState.confirmed}
            onRemove={clearRegister}
            onConfirm={confirmProgram}
          />
        </aside>
        {gameState.phase === 'programming' && (
          <ProgrammingHand
            cards={gameState.hand}
            registeredCardIds={registeredCardIds}
            confirmed={gameState.confirmed}
            onSelect={selectCard}
          />
        )}
      </div>
    </div>
  )
}

export default App
