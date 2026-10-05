import { useState, type FormEvent } from 'react'
import './LobbyPicker.css'

export type LobbyOption = {
  id: string
  name: string
  number: string
  players: number
  capacity: number
}

type LobbyPickerProps = {
  joining: boolean
  onSelectLobby: (lobby: LobbyOption) => void
  username: string
}

const initialLobbies: LobbyOption[] = [
  { id: 'lobby-0421', name: 'Foundry Floor', number: '0421', players: 2, capacity: 6 },
  { id: 'lobby-0188', name: 'Laser Maze', number: '0188', players: 4, capacity: 6 },
  { id: 'lobby-0927', name: 'Checkpoint Circuit', number: '0927', players: 1, capacity: 6 },
  { id: 'lobby-0714', name: 'Gearworks', number: '0714', players: 3, capacity: 6 },
]

function generateLobbyNumber(lobbies: readonly LobbyOption[]): string {
  let number = ''
  do {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    number = String(1000 + (random % 9000))
  } while (lobbies.some((lobby) => lobby.number === number))
  return number
}

function BoardBackground() {
  return (
    <div className="lobby-picker-background" aria-hidden="true">
      {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
    </div>
  )
}

export default function LobbyPicker({ joining, onSelectLobby, username }: LobbyPickerProps) {
  const [lobbies, setLobbies] = useState(initialLobbies)
  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newLobbyName, setNewLobbyName] = useState('')
  const [newLobbyNumber, setNewLobbyNumber] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function beginCreate() {
    setNewLobbyNumber(generateLobbyNumber(lobbies))
    setNewLobbyName('')
    setError(null)
    setCreating(true)
  }

  function createLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newLobbyName.trim()
    if (!name || !newLobbyNumber) {
      setError('Enter a lobby name.')
      return
    }
    const lobby: LobbyOption = {
      id: `lobby-${newLobbyNumber}`,
      name,
      number: newLobbyNumber,
      players: 1,
      capacity: 6,
    }
    setLobbies((current) => [lobby, ...current])
    setSelectedLobbyId(lobby.id)
    setCreating(false)
    setNewLobbyNumber(null)
    setError(null)
  }

  const selectedLobby = lobbies.find((lobby) => lobby.id === selectedLobbyId) ?? null

  return (
    <main className="lobby-picker-page">
      <BoardBackground />
      <section className="lobby-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="lobby-picker-heading">
        <header className="lobby-picker-header">
          <span className="lobby-picker-brand-mark" aria-hidden="true">R</span>
          <div>
            <p>Signed in as <strong>{username}</strong></p>
            <h1 id="lobby-picker-heading">Choose a lobby</h1>
          </div>
        </header>

        {creating ? (
          <form className="lobby-picker-create" onSubmit={createLobby}>
            <label className="lobby-picker-label">
              <span>Lobby name</span>
              <input
                autoFocus
                maxLength={32}
                onChange={(event) => {
                  setNewLobbyName(event.target.value)
                  setError(null)
                }}
                placeholder="e.g. The Workshop"
                value={newLobbyName}
              />
            </label>
            <label className="lobby-picker-label">
              <span>Lobby number</span>
              <input aria-label="Generated lobby number" readOnly value={newLobbyNumber ?? ''} />
            </label>
            {error && <p className="lobby-picker-error" role="alert">{error}</p>}
            <div className="lobby-picker-actions">
              <button className="lobby-picker-secondary" onClick={() => setCreating(false)} type="button">
                Cancel
              </button>
              <button className="lobby-picker-primary" type="submit">Create lobby</button>
            </div>
          </form>
        ) : (
          <button className="lobby-picker-create-button" onClick={beginCreate} type="button">
            <span aria-hidden="true">+</span>
            Create a lobby
          </button>
        )}

        <h2 className="lobby-picker-list-heading">Available lobbies</h2>
        <div className="lobby-picker-list" role="listbox" aria-label="Available lobbies">
          {lobbies.map((lobby) => (
            <button
              aria-selected={selectedLobbyId === lobby.id}
              className="lobby-picker-row"
              key={lobby.id}
              onClick={() => setSelectedLobbyId(lobby.id)}
              role="option"
              type="button"
            >
              <span className="lobby-picker-row-main">
                <strong>{lobby.name}</strong>
                <span>Lobby #{lobby.number}</span>
              </span>
              <span className="lobby-picker-row-players">{lobby.players}/{lobby.capacity} players</span>
            </button>
          ))}
        </div>

        <button
          className="lobby-picker-primary lobby-picker-join"
          disabled={!selectedLobby || joining}
          onClick={() => selectedLobby && onSelectLobby(selectedLobby)}
          type="button"
        >
          {joining ? 'Joining game…' : 'Join selected lobby'}
        </button>
      </section>
    </main>
  )
}