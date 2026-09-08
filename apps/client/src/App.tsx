import './App.css'
import BoardViewport from './components/BoardViewport.tsx'

function App() {
  return (
    <div className="game">
      <BoardViewport />
      <div className="game-overlay" />
    </div>
  )
}

export default App
