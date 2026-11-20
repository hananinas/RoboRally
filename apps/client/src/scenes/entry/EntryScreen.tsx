import type { ReactNode } from 'react'
import '@robo-rally/theme/board-background.css'
import './entry-tokens.css'
import './Entry.css'
import GameMenu from '../active-game/components/GameMenu'

export default function EntryScreen({ children, onLogout, onSettings, aside }: { children: ReactNode; onLogout?: () => void; onSettings?: () => void; aside?: ReactNode }) {
  return (
    <main className="entry">
      <div className="roborally-board-background" aria-hidden="true" />
      <div className={`entry-layout${aside ? ' entry-layout--wide' : ''}`}>
        <section className="entry-panel" aria-labelledby="entry-heading">
          <div className="entry-panel__header">
            <h1 id="entry-heading">RoboRally</h1>
            {onLogout && onSettings && (
              <GameMenu onLogout={onLogout} onSettings={onSettings} />
            )}
          </div>
          {children}
        </section>
        {aside && <div className="entry-side-panels">{aside}</div>}
      </div>
    </main>
  )
}
