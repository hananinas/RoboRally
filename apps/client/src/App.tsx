import Lobby from './scenes/lobby/Lobby.tsx'
import useGameSocket from './useGameSocket.ts'

function App() {
  useGameSocket()
  return <Lobby />
}

export default App
