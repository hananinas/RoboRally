import { useState } from 'react'
import GameMenu from './GameMenu.tsx'
import Panel from './Panel.tsx'

type PlayerPanelProps = {
  player: { name: string; lastCheckpoint: number }
  robotColour?: string
  checkpointCount: number
  onLeave?: () => void
  leaveDisabled?: boolean
  onLogout: () => void
  onSettings: () => void
}

// Shows collapsible player details.
function PlayerPanel({ player, robotColour, checkpointCount, onLeave, leaveDisabled, onLogout, onSettings }: PlayerPanelProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <Panel className="player-panel">
      <header className="player-panel__header">
        <h1 className="player-panel__name" aria-label={player.name}>
          {robotColour && (
            <span
              className="player-panel__colour"
              style={{ backgroundColor: robotColour }}
              aria-label="Robot colour"
              role="img"
            />
          )}
          {player.name}
        </h1>
        <GameMenu onLeave={onLeave} leaveDisabled={leaveDisabled} onLogout={onLogout} onSettings={onSettings} />
      </header>
      {expanded && (
        <div className="player-panel__details">
          {['Checkpoints', 'Health', 'Energy', 'Upgrades'].map((section) => (
            <section key={section} className="player-panel__detail">
              <h2>{section}</h2>
              {section === 'Checkpoints' && <p>{player.lastCheckpoint}/{checkpointCount}</p>}
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
