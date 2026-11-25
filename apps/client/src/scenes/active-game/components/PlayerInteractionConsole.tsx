import { useId, type ReactNode } from 'react'

function PlayerInteractionConsole({ children }: { children?: ReactNode }) {
  const headingId = useId()

  return (
    <section className="interaction-console hud-panel-surface" aria-labelledby={headingId}>
      <h2 id={headingId} className="register-panel__heading">Player Interaction Console</h2>
      <div className="interaction-console__body">
        {children ?? <p className="interaction-console__empty">No interaction requested.</p>}
      </div>
    </section>
  )
}

export default PlayerInteractionConsole