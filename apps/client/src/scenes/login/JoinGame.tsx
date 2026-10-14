type JoinGameProps = {
  username: string
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: () => void
}

export default function JoinGame({ username, pending, connected, error, onJoin }: JoinGameProps) {
  return (
    <>
      <p>{username}</p>
      {error && <p className="login-validation login-validation--error" role="alert">{error}</p>}
      <button
        autoFocus
        className="login-primary-button"
        disabled={pending || !connected}
        onClick={onJoin}
        type="button"
      >
        {pending ? 'Joining game…' : 'Join game'}
      </button>
    </>
  )
}
