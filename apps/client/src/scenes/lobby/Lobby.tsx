import type { FormEvent } from 'react'
import './Lobby.css'
import { isValidUsername } from './username.ts'
import type { SocketStatus } from '../../useGameSocket.ts'

type LobbyProps = {
  connectionStatus: SocketStatus
  error: string | null
  onSubmitUsername: (username: string) => void
  onUsernameChange: (username: string) => void
  pending: boolean
  pendingLabel: string
  retryingJoin: boolean
  requiresReconnect: boolean
  usernameLocked: boolean
  username: string
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

export default function Lobby({
  connectionStatus,
  error,
  onSubmitUsername,
  onUsernameChange,
  pending,
  pendingLabel,
  retryingJoin,
  requiresReconnect,
  usernameLocked,
  username,
}: LobbyProps) {
  const usernameLength = Array.from(username).length
  const usernameIsValid = isValidUsername(username)
  const connecting = connectionStatus === 'connecting'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!usernameIsValid) return
    onSubmitUsername(username)
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
              aria-describedby="username-help"
              aria-invalid={usernameLength > 30}
              autoComplete="username"
              disabled={usernameLocked}
              name="username"
              onChange={(event) => onUsernameChange(event.target.value)}
              placeholder="e.g. CircuitBreaker"
              type="text"
              value={username}
            />
          </label>
          <p
            className={`lobby-validation${usernameLength > 30 || error ? ' lobby-validation--error' : ''}`}
            id="username-help"
            role={error ? 'alert' : undefined}
          >
            {error ?? (usernameLength > 30
              ? 'Username cannot exceed 30 characters.'
              : 'Use 1–30 characters.')}
          </p>
          <button
            className="lobby-primary-button"
            disabled={!usernameIsValid || pending || connecting}
            type="submit"
          >
            {pending ? pendingLabel
              : connecting ? 'Connecting…'
                : requiresReconnect ? 'Retry connection'
                : retryingJoin && connectionStatus === 'connected' ? 'Retry joining'
                : connectionStatus === 'connected' ? 'Continue' : 'Retry connection'}
          </button>
        </form>
      </section>
    </main>
  )
}
