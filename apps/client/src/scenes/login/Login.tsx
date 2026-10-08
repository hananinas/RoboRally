import type { FormEvent } from 'react'
import EntryScreen from './EntryScreen.tsx'
import { isValidUsername } from './username.ts'
import type { SocketStatus } from '../../useGameSocket.ts'

type LoginProps = {
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

export default function Login({
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
}: LoginProps) {
  const usernameLength = Array.from(username).length
  const usernameIsValid = isValidUsername(username)
  const connecting = connectionStatus === 'connecting'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!usernameIsValid) return
    onSubmitUsername(username)
  }

  return (
    <EntryScreen>
        <form onSubmit={handleSubmit}>
          <label className="login-field">
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
          <label className="login-field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              disabled={usernameLocked}
              name="password"
              type="password"
            />
          </label>
          <p
            className={`login-validation${usernameLength > 30 || error ? ' login-validation--error' : ''}`}
            id="username-help"
            role={error ? 'alert' : undefined}
          >
            {error ?? (usernameLength > 30
              ? 'Username cannot exceed 30 characters.'
              : 'Use 1–30 characters.')}
          </p>
          <button
            className="login-primary-button"
            disabled={!usernameIsValid || pending || connecting}
            type="submit"
          >
            {pending ? pendingLabel
              : connecting ? 'Connecting…'
                : requiresReconnect ? 'Retry connection'
                : retryingJoin && connectionStatus === 'connected' ? 'Retry joining'
                : connectionStatus === 'connected' ? 'Log in' : 'Retry connection'}
          </button>
        </form>
    </EntryScreen>
  )
}
