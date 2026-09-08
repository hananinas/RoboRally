import type { ClientGameState } from '../gameState.ts'
import Panel from './Panel.tsx'

type PlayerPanelProps = {
  player: ClientGameState['player']
}

function PlayerPanel({ player }: PlayerPanelProps) {
  return (
    <Panel className="player-panel">
      <h1 className="player-panel__name">{player.name}</h1>
    </Panel>
  )
}

export default PlayerPanel
