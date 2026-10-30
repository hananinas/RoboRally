import type { ReactNode } from 'react'
import './Login.css'

export default function EntryScreen({ children }: { children: ReactNode }) {
  return (
    <main className="login">
      <div className="login-board-background" aria-hidden="true">
        {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
      </div>
      <section className="login-panel" aria-labelledby="login-heading">
        <h1 id="login-heading">RoboRally</h1>
        <p>
          <a href="/auth/login">Log in (OIDC)</a>
          {' · '}
          <a href="/auth/logout">Log out</a>
        </p>
        {children}
      </section>
    </main>
  )
}
