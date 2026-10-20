import type { GameId, LobbyDetails } from '@robo-rally/game-events'
import { useState } from 'react'
import type { GameSocket } from '../../useGameSocket.ts'
import map1 from './maps/map-1.png'
import map2 from './maps/map-2.png'
import useLobbyDetails from './useLobbyDetails.ts'

type LobbyScreenProps = {
  socket: GameSocket
  username: string
  pending: boolean
  connected: boolean
  error: string | null
  onJoin: (gameId: GameId) => void
}



const MAX_PLAYERS = 6

const sampleLobbies = [
  { id: 'lobby-2', name: 'Lobby 2', map: 'Map 2', image: map2, players: 4, locked: true },
  { id: 'lobby-3', name: 'Lobby 3', map: 'Map 1', image: map1, players: 6, locked: false },
]

export default function LobbyScreen({ socket, username, pending, connected, error, onJoin }: LobbyScreenProps) {
  const { state: details, refresh } = useLobbyDetails(socket, connected)
  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null)
  const lobby = details.status === 'loaded' ? details.lobby : null
  // A refresh may return another game, so only a still-listed selection counts.
  const selected = lobby !== null && lobby.gameId === selectedLobbyId ? lobby : null

  return (
    <>
      <p>{username}</p>
      <ul className="lobby-list" aria-label="Lobbies">
        <li>
          {details.status === 'loading' && (
            <p className="lobby lobby--message" role="status">Loading lobby details…</p>
          )}
          {details.status === 'error' && (
            <div className="lobby lobby--message">
              <p className="login-validation login-validation--error" role="alert">
                Could not load lobby details. {details.message}
              </p>
              <button type="button" className="lobby__action" disabled={!connected} onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          {details.status === 'loaded' && lobby === null && (
            <p className="lobby lobby--message" role="status">No game is open right now.</p>
          )}
          {lobby && (
            <SharedLobby
              lobby={lobby}
              selected={selected !== null}
              disabled={pending || lobby.players.length >= lobby.map.maxPlayers}
              onSelect={() => setSelectedLobbyId(lobby.gameId)}
            />
          )}
        </li>
        {sampleLobbies.map((sample) => (
          <li key={sample.id}>
            <button type="button" className="lobby" aria-pressed={false} disabled>
              <img className="lobby__image" src={sample.image} alt={`${sample.map} preview`} />
              <span className="lobby__details">
                <span className="lobby__name">{sample.name}</span>
                <span className="lobby__map">{sample.map}</span>
              </span>
              <span className="lobby__status">
                <span>{sample.players}/{MAX_PLAYERS} players</span>
                <LockIcon locked={sample.locked} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="lobby__action"
        disabled={details.status === 'loading' || pending || !connected}
        onClick={refresh}
      >
        Refresh
      </button>
      {error && <p className="login-validation login-validation--error" role="alert">{error}</p>}
      <button
        className="login-primary-button"
        disabled={pending || !connected || selected === null}
        onClick={() => selected && onJoin(selected.gameId)}
        type="button"
      >
        {pending ? 'Joining game…' : 'Join game'}
      </button>
    </>
  )
}

type SharedLobbyProps = {
  lobby: LobbyDetails
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

function SharedLobby({ lobby, selected, disabled, onSelect }: SharedLobbyProps) {
  const usernames = lobby.players.map((player) => player.username)
  return (
    <button
      type="button"
      className={selected ? 'lobby lobby--selected' : 'lobby'}
      aria-pressed={selected}
      disabled={disabled}
      autoFocus
      onClick={onSelect}
    >
      <img className="lobby__image" src={lobby.map.icon} alt={`${lobby.map.name} preview`} />
      <span className="lobby__details">
        <span className="lobby__name">{lobby.name}</span>
        <span className="lobby__map">{lobby.map.name}</span>
        <span className="lobby__players">
          {usernames.length > 0 ? usernames.join(', ') : 'No players yet'}
        </span>
      </span>
      <span className="lobby__status">
        <span>{lobby.players.length}/{lobby.map.maxPlayers} players</span>
        <LockIcon locked={false} />
      </span>
    </button>
  )
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <span role="img" aria-label={locked ? 'Locked' : 'Unlocked'}>
      {locked ? '🔒' : '🔓'}
    </span>
  )
}