import type { LobbySummary } from '@robo-rally/game-events'
import { useState } from 'react'
import map1 from './maps/map-1.png'

type JoinGameProps = {
  username: string
  lobbies: readonly LobbySummary[]
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: (lobbyId: string) => void
  onCreate: () => void
  onRefresh: () => void
}

export default function JoinGame({ username, lobbies, pending, connected, error, onJoin, onCreate, onRefresh }: JoinGameProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = lobbies.find((lobby) => lobby.lobbyId === selectedId)
  const firstJoinable = lobbies.find((lobby) => lobby.playerCount < lobby.maxPlayers)

  return (
    <>
      <p>{username}</p>
      <ul className="lobby-list" aria-label="Lobbies">
        {lobbies.map((lobby) => (
          <li key={lobby.lobbyId}>
            <button
              type="button"
              className={lobby.lobbyId === selectedId ? 'lobby lobby--selected' : 'lobby'}
              aria-pressed={lobby.lobbyId === selectedId}
              disabled={pending || !connected || lobby.playerCount >= lobby.maxPlayers}
              autoFocus={lobby === firstJoinable}
              onClick={() => setSelectedId(lobby.lobbyId)}
            >
              <img className="lobby__image" src={map1} alt="Map 1 preview" />
              <span className="lobby__details">
                <span className="lobby__name">{lobby.name}</span>
                <span className="lobby__map">Map 1</span>
              </span>
              <span className="lobby__status">
                <span>{lobby.playerCount}/{lobby.maxPlayers} players</span>
                <span role="img" aria-label="Unlocked">
                  🔓
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="login-secondary-button" type="button" disabled={pending || !connected} onClick={onCreate}>Create lobby</button>
      <button className="login-secondary-button" type="button" disabled={pending || !connected} onClick={onRefresh}>Refresh</button>
      {error && <p className="login-validation login-validation--error" role="alert">{error}</p>}
      <button
        className="login-primary-button"
        disabled={pending || !connected || !selected || selected.playerCount >= selected.maxPlayers}
        onClick={() => selected && onJoin(selected.lobbyId)}
        type="button"
      >
        {pending ? 'Joining game…' : 'Join game'}
      </button>
    </>
  )
}
