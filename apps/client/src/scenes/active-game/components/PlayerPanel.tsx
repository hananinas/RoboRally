import { useState } from 'react'
import GameMenu from './GameMenu.tsx'
import Panel from './Panel.tsx'

type PlayerPanelProps = {
  player: { name: string }
}

// Shows collapsible player details.
function PlayerPanel({ player }: PlayerPanelProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <Panel className="player-panel">
      <header className="player-panel__header">
        <h1 className="player-panel__name">{player.name}</h1>
        <GameMenu />
      </header>
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
