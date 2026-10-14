type JoinGameProps = {
  username: string
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: () => void
}

const MAX_PLAYERS = 6

// Placeholder rows until lobbies come from the Game Service.
const lobbies = [
  { id: 'lobby-1', name: 'Lobby 1', map: 'Map 1', players: 2, locked: false },
  { id: 'lobby-2', name: 'Lobby 2', map: 'Map 2', players: 4, locked: true },
  { id: 'lobby-3', name: 'Lobby 3', map: 'Map 1', players: 6, locked: false },
]

export default function JoinGame({ username, pending, connected, error, onJoin }: JoinGameProps) {
  return (
    <>
      <p>{username}</p>
      <ul className="lobby-list" aria-label="Lobbies">
        {lobbies.map((lobby) => (
          <li key={lobby.id} className="lobby">
            <div className="lobby__image" role="img" aria-label="Lobby preview" />
            <div className="lobby__details">
              <span className="lobby__name">{lobby.name}</span>
              <span className="lobby__map">{lobby.map}</span>
            </div>
            <div className="lobby__status">
              <span>{lobby.players}/{MAX_PLAYERS} players</span>
              <span role="img" aria-label={lobby.locked ? 'Locked' : 'Unlocked'}>
                {lobby.locked ? '🔒' : '🔓'}
              </span>
            </div>
          </li>
        ))}
      </ul>
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
