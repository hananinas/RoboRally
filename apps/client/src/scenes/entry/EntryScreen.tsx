import type { ReactNode } from 'react'
import './entry-tokens.css'
import './Entry.css'

export default function EntryScreen({ children, onLogout, aside }: { children: ReactNode; onLogout?: () => void; aside?: ReactNode }) {
  return (
    <main className="entry">
      <div className="entry-board-background" aria-hidden="true">
        {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
      </div>
      <div className={`entry-layout${aside ? ' entry-layout--wide' : ''}`}>
        <section className="entry-panel" aria-labelledby="entry-heading">
          <div className="entry-panel__header">
            <h1 id="entry-heading">RoboRally</h1>
            {onLogout && (
              <button className="entry-panel__logout" type="button" onClick={onLogout}>Logout</button>
            )}
          </div>
          {children}
        </section>
        {aside && <aside className="entry-panel" aria-label="Your robot">{aside}</aside>}
      </div>
    </main>
  )
}
