import type { ReactNode } from 'react'
import './entry-tokens.css'
import './Login.css'

type Props = { children: ReactNode; aside?: ReactNode }

export default function EntryScreen({ children, aside }: Props) {
  return (
    <main className="login">
      <div className="login-board-background" aria-hidden="true">
        {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
      </div>
      <div className={`entry-layout${aside ? ' entry-layout--wide' : ''}`}>
        <section className="login-panel" aria-labelledby="login-heading">
          <header className="entry-header">
            <h1 id="login-heading">RoboRally</h1>
            <nav aria-label="Account">
              <a href="/auth/login">Log in (OIDC)</a>
              <a href="/auth/logout">Log out</a>
            </nav>
          </header>
          {children}
        </section>
        {aside && <aside className="login-panel" aria-label="Your robot">{aside}</aside>}
      </div>
    </main>
  )
}
