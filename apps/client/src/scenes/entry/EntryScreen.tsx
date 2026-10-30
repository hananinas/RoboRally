import type { ReactNode } from 'react'
import './Entry.css'

export default function EntryScreen({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  return (
    <main className="entry">
      <div className="entry-board-background" aria-hidden="true">
        {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
      </div>
      <section className="entry-panel" aria-labelledby="entry-heading">
        <div className="entry-panel__header">
          <h1 id="entry-heading">RoboRally</h1>
          {onLogout && (
            <button className="entry-panel__logout" type="button" onClick={onLogout}>Logout</button>
          )}
        </div>
        {children}
      </section>
    </main>
  )
}
