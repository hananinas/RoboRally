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

// Display-only placeholders until game.getLobbyDetails supplies the shared game's
// name, playerCount and map. Row IDs are UI keys; App joins VITE_GAME_ID.
const lobbies = [
  {
    id: 'lobby-1', name: 'Lobby 1', playerCount: 2, locked: false, joinable: true,
    map: { name: 'Map 1', image: map1, maxPlayers: 6 },
  },
  {
    id: 'lobby-2', name: 'Lobby 2', playerCount: 4, locked: true, joinable: false,
    map: { name: 'Map 2', image: map2, maxPlayers: 6 },
  },
  {
    id: 'lobby-3', name: 'Lobby 3', playerCount: 6, locked: false, joinable: false,
    map: { name: 'Map 1', image: map1, maxPlayers: 6 },
  },
]

export default function JoinGame({ username, pending, connected, error, onJoin }: JoinGameProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <>
      <p>{username}</p>
      <ul className="lobby-list" aria-label="Lobbies">
        {lobbies.map((lobby, index) => (
          <li key={lobby.id}>
            <button
              type="button"
              className={lobby.id === selectedId ? 'lobby lobby--selected' : 'lobby'}
              aria-pressed={lobby.id === selectedId}
              disabled={!lobby.joinable || pending}
              autoFocus={index === 0}
              onClick={() => setSelectedId(lobby.id)}
            >
              <img className="lobby__image" src={lobby.map.image} alt={`${lobby.map.name} preview`} />
              <span className="lobby__details">
                <span className="lobby__name">{lobby.name}</span>
                <span className="lobby__map">{lobby.map.name}</span>
                {!lobby.joinable && <span className="lobby__sample">Sample lobby</span>}
              </span>
              <span className="lobby__status">
                <span>{lobby.playerCount}/{lobby.map.maxPlayers} players</span>
                {lobby.locked && <span role="img" aria-label="Locked">🔒</span>}
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
