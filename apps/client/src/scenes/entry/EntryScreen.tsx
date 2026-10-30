import type { ReactNode } from 'react'
import './Entry.css'

export default function EntryScreen({ children }: { children: ReactNode }) {
  return (
    <main className="entry">
      <div className="entry-board-background" aria-hidden="true">
        {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
      </div>
      <section className="entry-panel" aria-labelledby="entry-heading">
        <h1 id="entry-heading">RoboRally</h1>
        {children}
      </section>
    </main>
  )
}
