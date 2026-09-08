import { useState } from 'react'
import type { ClientGameState } from '../gameState.ts'
import Panel from './Panel.tsx'

type PlayerPanelProps = {
  player: ClientGameState['player']
}

function PlayerPanel({ player }: PlayerPanelProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <Panel className="player-panel">
      <h1 className="player-panel__name">{player.name}</h1>
      {expanded && (
        <div className="player-panel__details">
          {['Checkpoints', 'Health', 'Energy', 'Upgrades'].map((section) => (
            <section key={section} className="player-panel__detail">
              <h2>{section}</h2>
            </section>
          ))}
        </div>
      )}
      <button
        className="player-panel__toggle"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse player details' : 'Expand player details'}
        onClick={() => setExpanded((current) => !current)}
      />
    </Panel>
  )
}

export default PlayerPanel
