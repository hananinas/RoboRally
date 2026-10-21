import { useState } from 'react'
import map1 from './maps/map-1.png'
import map2 from './maps/map-2.png'

type JoinGameProps = {
  username: string
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: () => void
}

const MAX_PLAYERS = 6

// Placeholder rows until lobbies come from the Game Service. Only the first is joinable.
const lobbies = [
  { id: 'lobby-1', name: 'Lobby 1', map: 'Map 1', image: map1, players: 2, locked: false, joinable: true },
  { id: 'lobby-2', name: 'Lobby 2', map: 'Map 2', image: map2, players: 4, locked: true, joinable: false },
  { id: 'lobby-3', name: 'Lobby 3', map: 'Map 1', image: map1, players: 6, locked: false, joinable: false },
]

export default function JoinGame({ username, pending, connected, error, onJoin }: JoinGameProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <>
      <p>{username}</p>
      <ul className="lobby-list" aria-label="Lobbies">
        {lobbies.map((lobby) => (
          <li key={lobby.id}>
            <button
              type="button"
              className={lobby.id === selectedId ? 'lobby lobby--selected' : 'lobby'}
              aria-pressed={lobby.id === selectedId}
              disabled={!lobby.joinable || pending}
              autoFocus={lobby.joinable}
              onClick={() => setSelectedId(lobby.id)}
            >
              <img className="lobby__image" src={lobby.image} alt={`${lobby.map} preview`} />
              <span className="lobby__details">
                <span className="lobby__name">{lobby.name}</span>
                <span className="lobby__map">{lobby.map}</span>
              </span>
              <span className="lobby__status">
                <span>{lobby.players}/{MAX_PLAYERS} players</span>
                <span role="img" aria-label={lobby.locked ? 'Locked' : 'Unlocked'}>
                  {lobby.locked ? '🔒' : '🔓'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="login-validation login-validation--error" role="alert">{error}</p>}
      <button
        className="login-primary-button"
        disabled={pending || !connected || selectedId === null}
        onClick={onJoin}
        type="button"
      >
        {pending ? 'Joining game…' : 'Join game'}
      </button>
    </>
  )
}
