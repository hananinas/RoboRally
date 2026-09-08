import './App.css'
import BoardViewport from './components/BoardViewport.tsx'
import PlayerPanel from './components/PlayerPanel.tsx'
import ProgrammingHand from './components/ProgrammingHand.tsx'
import RegisterPanel from './components/RegisterPanel.tsx'
import { createMockGameState } from './gameState.ts'

function App() {
  const gameState = createMockGameState()

  return (
    <div className="game">
      <BoardViewport />
      <div className="game-overlay">
        <aside className="game-hud" aria-label="Game controls">
          <PlayerPanel player={gameState.player} />
          <RegisterPanel
            registers={gameState.registers}
            confirmed={gameState.confirmed}
          />
        </aside>
        {gameState.phase === 'programming' && (
          <ProgrammingHand cards={gameState.hand} />
        )}
      </div>
    </div>
  )
}

export default App
