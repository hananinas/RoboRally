import type { Standing } from '../gameState.ts'
import CheckpointProgress from './CheckpointProgress.tsx'
import './FinalStandings.css'

// Replaces the other players' registers once the race is over, so everyone sees how close they came.
export default function FinalStandings({ standings, checkpointCount }: {
  standings: readonly Standing[]
  checkpointCount: number
}) {
  if (standings.length === 0) return null

  return (
    <aside className="final-standings hud-panel-surface" aria-label="Final standings">
      <h2 className="final-standings__title">Final standings</h2>
      <ol className="final-standings__list">
        {standings.map((standing) => (
          <li
            key={standing.playerId}
            className="final-standings__row"
            data-winner={standing.isWinner || undefined}
            data-you={standing.isYou || undefined}
          >
            <span className="final-standings__place">{standing.place}</span>
            <span
              className="robot-swatch final-standings__colour"
              style={{ backgroundColor: standing.colour }}
              aria-hidden="true"
            />
            <span className="final-standings__name">
              {standing.username}
              {standing.isYou && <span className="final-standings__tag"> (you)</span>}
              {standing.left && <span className="final-standings__tag"> (left)</span>}
            </span>
            <CheckpointProgress collected={standing.lastCheckpoint} total={checkpointCount} />
          </li>
        ))}
      </ol>
    </aside>
  )
}
