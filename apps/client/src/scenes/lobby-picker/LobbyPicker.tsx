import { useState, type FormEvent } from 'react'
import type { CreateLobby, LobbySummary } from '@robo-rally/game-events'
import './LobbyPicker.css'

type LobbyPickerProps = {
  actionError: string | null
  actionPending: boolean
  lobbies: readonly LobbySummary[]
  onCreateLobby: (lobby: CreateLobby) => void
  onJoinLobby: (code: string) => void
  joining: boolean
  username: string
}

function generateLobbyCode(lobbies: readonly LobbySummary[]): string {
  let code = ''
  do {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    code = String(1000 + (random % 9000))
  } while (lobbies.some((lobby) => lobby.code === code))
  return code
}

function BoardBackground() {
  return (
    <div className="lobby-picker-background" aria-hidden="true">
      {Array.from({ length: 63 }, (_, index) => <div key={index} />)}
    </div>
  )
}

export default function LobbyPicker({
  actionError,
  actionPending,
  lobbies,
  onCreateLobby,
  onJoinLobby,
  joining,
  username,
}: LobbyPickerProps) {
  const [creating, setCreating] = useState(false)
  const [newLobbyName, setNewLobbyName] = useState('')
  const [newLobbyCode, setNewLobbyCode] = useState<string | null>(null)
  const [newLobbyMap, setNewLobbyMap] = useState<'Map 1' | 'Map 2'>('Map 1')
  const [error, setError] = useState<string | null>(null)
  const [lobbyCode, setLobbyCode] = useState('')
  const [selectedLobbyCode, setSelectedLobbyCode] = useState<string | null>(null)
  const [createdLobbyCode, setCreatedLobbyCode] = useState<string | null>(null)

  function beginCreate() {
    setNewLobbyCode(generateLobbyCode(lobbies))
    setNewLobbyName('')
    setNewLobbyMap('Map 1')
    setError(null)
    setCreating(true)
  }

  function createLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newLobbyName.trim()
    if (!name || !newLobbyCode) {
      setError('Enter a lobby name.')
      return
    }
    onCreateLobby({ name, code: newLobbyCode, map: newLobbyMap })
    setCreatedLobbyCode(newLobbyCode)
    setSelectedLobbyCode(newLobbyCode)
    setCreating(false)
    setNewLobbyCode(null)
    setError(null)
  }

  function findLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const lobby = lobbies.find((candidate) => candidate.code === lobbyCode.trim().toUpperCase())
    if (!lobby) {
      setError('No lobby has that code.')
      return
    }
    setSelectedLobbyCode(lobby.code)
    setError(null)
  }

  const selectedLobby = lobbies.find((lobby) => lobby.code === selectedLobbyCode) ?? null

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
              <span>Lobby code</span>
              <input aria-label="Generated lobby code" readOnly value={newLobbyCode ?? ''} />
            </label>
            <fieldset className="lobby-picker-map">
              <legend>Choose a map</legend>
              <div>
                {(['Map 1', 'Map 2'] as const).map((map) => (
                  <label key={map}>
                    <input
                      checked={newLobbyMap === map}
                      name="lobby-map"
                      onChange={() => setNewLobbyMap(map)}
                      type="radio"
                      value={map}
                    />
                    <span>{map}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {(error ?? actionError) && <p className="lobby-picker-error" role="alert">{error ?? actionError}</p>}
            <div className="lobby-picker-actions">
              <button className="lobby-picker-secondary" onClick={() => setCreating(false)} type="button">
                Cancel
              </button>
              <button className="lobby-picker-primary" disabled={actionPending} type="submit">
                {actionPending ? 'Creating…' : 'Create lobby'}
              </button>
            </div>
          </form>
        ) : (
          <button className="lobby-picker-create-button" onClick={beginCreate} type="button">
            <span aria-hidden="true">+</span>
            Create a lobby
          </button>
        )}

        <form className="lobby-picker-code-form" onSubmit={findLobby}>
          <label className="lobby-picker-label">
            <span>Join using a lobby code</span>
            <input
                  maxLength={4}
              onChange={(event) => {
                setLobbyCode(event.target.value.toUpperCase())
                setError(null)
              }}
              placeholder="4-digit code"
              value={lobbyCode}
            />
          </label>
          <button className="lobby-picker-secondary" type="submit">Find</button>
        </form>
        {(error ?? actionError) && !creating && <p className="lobby-picker-error" role="alert">{error ?? actionError}</p>}

        <h2 className="lobby-picker-list-heading">Available lobbies</h2>
        {createdLobbyCode && !lobbies.some((lobby) => lobby.code === createdLobbyCode) && (
          <p className="lobby-picker-note" role="status">Creating lobby…</p>
        )}
        <div className="lobby-picker-list" role="listbox" aria-label="Available lobbies">
          {lobbies.map((lobby) => (
            <button
              aria-selected={selectedLobbyCode === lobby.code || createdLobbyCode === lobby.code}
              className="lobby-picker-row"
              key={lobby.lobbyId}
              onClick={() => setSelectedLobbyCode(lobby.code)}
              role="option"
              type="button"
            >
              <span className="lobby-picker-row-main">
                <strong>{lobby.name}</strong>
                <span>Lobby #{lobby.code} · {lobby.map}</span>
              </span>
              <span className="lobby-picker-row-players">{lobby.playerCount}/{lobby.capacity} players</span>
            </button>
          ))}
        </div>

        <button
          className="lobby-picker-primary lobby-picker-join"
          disabled={!selectedLobby || joining || actionPending}
          onClick={() => selectedLobby && onJoinLobby(selectedLobby.code)}
          type="button"
        >
          {joining ? 'Joining game…' : actionPending ? 'Joining lobby…' : 'Join selected lobby'}
        </button>
      </section>
    </main>
  )
}