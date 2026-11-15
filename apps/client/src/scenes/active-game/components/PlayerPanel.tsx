import { useId, useState } from 'react'
import CheckpointProgress from './CheckpointProgress.tsx'
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
  const detailsId = useId()

  return (
    <Panel className="player-panel">
      <header className="player-panel__header">
        <h1 className="player-panel__name" aria-label={player.name}>
          {robotColour && (
            <span
              className="robot-swatch"
              style={{ backgroundColor: robotColour }}
              aria-label="Robot colour"
              role="img"
            />
          )}
          {player.name}
        </h1>
        <div className="player-panel__actions">
          <button
            className="player-panel__toggle"
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? 'Collapse player details' : 'Expand player details'}
            onClick={() => setExpanded((current) => !current)}
          />
          <GameMenu onLeave={onLeave} leaveDisabled={leaveDisabled} onLogout={onLogout} onSettings={onSettings} />
        </div>
      </header>
      <div id={detailsId} className="player-panel__details" hidden={!expanded}>
        {['Checkpoints', 'Health', 'Energy', 'Upgrades'].map((section) => (
          <section key={section} className="player-panel__detail">
            <h2>{section}</h2>
            {section === 'Checkpoints' && <CheckpointProgress collected={player.lastCheckpoint} total={checkpointCount} />}
          </section>
        ))}
      </div>
    </Panel>
  )
}

export default PlayerPanel
