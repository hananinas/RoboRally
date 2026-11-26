import type { BoardMapName, BoardMapSummary, LobbySummary } from '@robo-rally/game-events'
import { useState } from 'react'

type LobbyScreenProps = {
  username: string
  lobbies: readonly LobbySummary[]
  maps: readonly BoardMapSummary[]
  mapsLoaded: boolean
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: (lobbyId: string) => void
  onCreate: (mapName: BoardMapName, name: string) => void
  onRefresh: () => void
}

export default function LobbyScreen({ username, lobbies, maps, mapsLoaded, pending, connected, error, onJoin, onCreate, onRefresh }: LobbyScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingLobby, setCreatingLobby] = useState(false)
  const [selectedMap, setSelectedMap] = useState<BoardMapName | null>(null)
  const [lobbyName, setLobbyName] = useState('')
  const selected = lobbies.find((lobby) => lobby.lobbyId === selectedId)
  const firstJoinable = lobbies.find((lobby) => lobby.playerCount < lobby.maxPlayers)
  const selectedMapInfo = maps.find((map) => map.mapName === selectedMap)

  if (creatingLobby) {
    return (
      <section aria-labelledby="map-selection-title">
        <h2 id="map-selection-title">Choose a map</h2>
        <div className="map-options" role="group" aria-label="Available maps">
          {maps.map((map) => (
            <button
              className={map.mapName === selectedMap ? 'map-option map-option--selected' : 'map-option'}
              type="button"
              key={map.mapName}
              aria-pressed={map.mapName === selectedMap}
              aria-label={map.name}
              disabled={pending || !connected}
              onClick={() => setSelectedMap(map.mapName)}
            >
              <img src={map.icon} alt="" />
              {map.name}
            </button>
          ))}
        </div>
        {maps.length === 0 && <p role="status">No maps are available.</p>}
        {selectedMapInfo && <p>Selected map: {selectedMapInfo.name}</p>}
        <label htmlFor="lobby-name">Lobby name</label>
        <input
          id="lobby-name"
          name="lobbyName"
          type="text"
          maxLength={50}
          required
          value={lobbyName}
          onChange={(event) => setLobbyName(event.target.value)}
        />
        {error && <p className="entry-validation entry-validation--error" role="alert">{error}</p>}
        <button className="entry-primary-button" type="button" disabled={pending || !connected || !selectedMap || !lobbyName.trim()} onClick={() => selectedMap && onCreate(selectedMap, lobbyName.trim())}>
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
      {!mapsLoaded && <p role="status">Loading maps…</p>}
      {mapsLoaded && maps.length === 0 && <p role="status">No maps are available.</p>}
      <button className="entry-secondary-button" type="button" disabled={pending || !connected || !mapsLoaded || maps.length === 0} onClick={() => {
        setSelectedMap(maps[0]?.mapName ?? null)
        setCreatingLobby(true)
      }}>Create lobby</button>
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
