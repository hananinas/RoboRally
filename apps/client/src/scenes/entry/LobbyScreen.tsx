import type { LobbySummary } from '@robo-rally/game-events'
import { useState } from 'react'

type LobbyScreenProps = {
  username: string
  lobbies: readonly LobbySummary[]
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: (lobbyId: string) => void
  onRefresh: () => void
}

export default function LobbyScreen({ username, lobbies, pending, connected, error, onJoin, onRefresh }: LobbyScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingLobby, setCreatingLobby] = useState(false)
  const selected = lobbies.find((lobby) => lobby.lobbyId === selectedId)
  const firstJoinable = lobbies.find((lobby) => lobby.playerCount < lobby.maxPlayers)

  if (creatingLobby) {
    return (
      <section aria-labelledby="map-selection-title">
        <h2 id="map-selection-title">Choose a map</h2>
        <p>Map options will be available in the next step.</p>
        <button className="entry-secondary-button" type="button" onClick={() => setCreatingLobby(false)}>
          Back to lobbies
        </button>
      </section>
    )
  }

  return (
    <>
      <p>{username}</p>
      <ul className="lobby-list" aria-label="Lobbies">
        {lobbies.length === 0 && !error && (
          <li><p className="lobby lobby--message" role="status">No lobby is open right now.</p></li>
        )}
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
              <span className="lobby__details">
                <span className="lobby__name">{lobby.name}</span>
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
      <button className="entry-secondary-button" type="button" disabled={pending || !connected} onClick={() => setCreatingLobby(true)}>Create lobby</button>
      <button className="entry-secondary-button" type="button" disabled={pending || !connected} onClick={onRefresh}>Refresh</button>
      {error && <p className="entry-validation entry-validation--error" role="alert">{error}</p>}
      <button
        className="entry-primary-button"
        disabled={pending || !connected || !selected || selected.playerCount >= selected.maxPlayers}
        onClick={() => selected && onJoin(selected.lobbyId)}
        type="button"
      >
        {pending ? 'Joining game…' : 'Join game'}
      </button>
    </>
  )
}
