import { useState, type FormEvent } from 'react'
import './Lobby.css'

type LobbyProps = {
  onSubmitUsername?: (username: string) => void
}

function BotIcon() {
  return (
    <svg
      aria-hidden="true"
      className="lobby-bot-icon"
      viewBox="0 0 24 30"
      width="34"
      height="42.5"
    >
      <rect x="7" y="9" width="10" height="15" rx="3" fill="#c94b3f" />
      <rect x="10.5" y="2" width="3" height="8" rx="1.4" fill="#c94b3f" />
    </svg>
  )
}

function BoardBackground() {
  return (
    <div className="lobby-board-background" aria-hidden="true">
      {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
    </div>
  )
}

export default function Lobby({ onSubmitUsername }: LobbyProps) {
  const [username, setUsername] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmitUsername?.(username)
  }

  return (
    <main className="lobby">
      <BoardBackground />
      <section className="lobby-panel" aria-labelledby="login-heading">
        <div className="lobby-brand">
          <BotIcon />
          <h1 id="login-heading">Robo<span>Rally</span></h1>
        </div>
        <p className="lobby-tagline">
          Enter a username to join the shared game.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="lobby-field">
            <span>Username</span>
            <input
              autoComplete="username"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. CircuitBreaker"
              type="text"
              value={username}
            />
          </label>
          <button className="lobby-primary-button" type="submit">
            Continue
          </button>
        </form>
      </section>
    </main>
  )
}
