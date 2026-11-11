import type { BoardMapName, LobbySummary } from '@robo-rally/game-events'
import { useState } from 'react'

const availableMaps: readonly { name: string; mapName: BoardMapName }[] = [
  { name: 'Empty Map', mapName: 'empty-map' },
  { name: 'Test Map', mapName: 'test-map' },
]

type LobbyScreenProps = {
  username: string
  lobbies: readonly LobbySummary[]
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: (lobbyId: string) => void
  onCreate: (mapName: BoardMapName) => void
  onRefresh: () => void
}

export default function LobbyScreen({ username, lobbies, pending, connected, error, onJoin, onCreate, onRefresh }: LobbyScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingLobby, setCreatingLobby] = useState(false)
  const [selectedMap, setSelectedMap] = useState<BoardMapName>('test-map')
  const selected = lobbies.find((lobby) => lobby.lobbyId === selectedId)
  const firstJoinable = lobbies.find((lobby) => lobby.playerCount < lobby.maxPlayers)

  if (creatingLobby) {
    return (
      <section aria-labelledby="map-selection-title">
        <h2 id="map-selection-title">Choose a map</h2>
        <div className="map-options" role="group" aria-label="Available maps">
          {availableMaps.map((map) => (
            <button
              className={map.mapName === selectedMap ? 'map-option map-option--selected' : 'map-option'}
              type="button"
              key={map.mapName}
              aria-pressed={map.mapName === selectedMap}
              disabled={pending || !connected}
              onClick={() => setSelectedMap(map.mapName)}
            >
              {map.name}
            </button>
          ))}
        </div>
        <p>Selected map: {availableMaps.find((map) => map.mapName === selectedMap)?.name}</p>
        {error && <p className="entry-validation entry-validation--error" role="alert">{error}</p>}
        <button className="entry-primary-button" type="button" disabled={pending || !connected} onClick={() => onCreate(selectedMap)}>
          {pending ? 'Creating lobby…' : 'Create lobby'}
        </button>
        <button className="entry-secondary-button" type="button" disabled={pending} onClick={() => setCreatingLobby(false)}>
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
