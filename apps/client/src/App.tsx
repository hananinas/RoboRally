import { useState } from 'react'
import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import Lobby from './scenes/lobby/Lobby.tsx'

function App() {
  const [gameStarted, setGameStarted] = useState(false)

  return gameStarted ? (
    <ActiveGame />
  ) : (
    <Lobby onStartGame={() => setGameStarted(true)} />
  )
}

export default App
