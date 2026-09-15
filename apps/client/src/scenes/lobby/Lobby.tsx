import { useState, type FormEvent, type ReactNode } from 'react'
import './Lobby.css'

type BotColor = 'blue' | 'red' | 'green' | 'gold'
type PlayerTag = 'HOST' | 'HOST · GUEST' | 'PLAYER'

type Player = {
  name: string
  color: BotColor
  tag: PlayerTag
}

type LobbyProps = {
  onStartGame: () => void
}

const BOT_COLORS: BotColor[] = ['red', 'green', 'gold']
const BOT_NAMES = ['Wrench_9', 'ShortCircuit', 'GearGrinder', 'FlameThrower', 'ScrapKing']
const GAME_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function createGameCode(): string {
  return Array.from({ length: 6 }, () =>
    GAME_CODE_CHARACTERS[Math.floor(Math.random() * GAME_CODE_CHARACTERS.length)],
  ).join('')
}

function BotIcon({ color, size = 22 }: { color: BotColor; size?: number }) {
  const fills: Record<BotColor, string> = {
    blue: '#4a7fd6',
    red: '#c94b3f',
    green: '#3fa06a',
    gold: '#e0bb1f',
  }
  const fill = fills[color]

  return (
    <svg
      aria-hidden="true"
      className="lobby-bot-icon"
      viewBox="0 0 24 30"
      width={size}
      height={(size * 30) / 24}
    >
      <rect x="7" y="9" width="10" height="15" rx="3" fill={fill} />
      <rect x="10.5" y="2" width="3" height="8" rx="1.4" fill={fill} />
    </svg>
  )
}

function BoardBackground() {
  return (
    <div className="lobby-board-background" aria-hidden="true">
      {Array.from({ length: 63 }, (_, index) => (
        <div key={index} />
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="lobby-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function AuthScreen({
  onEnterLobby,
}: {
  onEnterLobby: (player: Omit<Player, 'color'>) => void
}) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [signUpName, setSignUpName] = useState('')
  const [signUpEmail, setSignUpEmail] = useState('')
  const [signUpPassword, setSignUpPassword] = useState('')

  function switchTab(nextTab: 'signin' | 'signup') {
    setTab(nextTab)
    setError('')
  }

  function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!signInEmail.trim() || !signInPassword) {
      setError('Enter your email and password to sign in.')
      return
    }

    const localName = signInEmail.split('@')[0] ?? 'Player'
    onEnterLobby({
      name: localName.charAt(0).toUpperCase() + localName.slice(1),
      tag: 'HOST',
    })
  }

  function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!signUpName.trim() || !signUpEmail.trim() || !signUpPassword) {
      setError('Fill in a player name, email, and password.')
      return
    }
    if (signUpPassword.length < 8) {
      setError('Password needs to be at least 8 characters.')
      return
    }

    onEnterLobby({ name: signUpName.trim(), tag: 'HOST' })
  }

  function handleGuest() {
    onEnterLobby({
      name: `Guest${Math.floor(1000 + Math.random() * 9000)}`,
      tag: 'HOST · GUEST',
    })
  }

  return (
    <section className="lobby-panel auth-panel">
      <div className="lobby-brand">
        <BotIcon color="red" size={34} />
        <h1>Robo<span>Rally</span></h1>
      </div>
      <p className="lobby-tagline">
        Program your moves, dodge the lasers, race the checkpoints. Sign in to join a table.
      </p>

      <div className="lobby-tabs" role="tablist" aria-label="Authentication">
        <button
          className={tab === 'signin' ? 'active' : ''}
          onClick={() => switchTab('signin')}
          type="button"
        >
          Sign in
        </button>
        <button
          className={tab === 'signup' ? 'active' : ''}
          onClick={() => switchTab('signup')}
          type="button"
        >
          Sign up
        </button>
      </div>

      <p className="lobby-error" role="alert">{error}</p>

      {tab === 'signin' ? (
        <form onSubmit={handleSignIn}>
          <Field label="Email">
            <input
              autoComplete="email"
              onChange={(event) => setSignInEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={signInEmail}
            />
          </Field>
          <Field label="Password">
            <input
              autoComplete="current-password"
              onChange={(event) => setSignInPassword(event.target.value)}
              placeholder="••••••••"
              type="password"
              value={signInPassword}
            />
          </Field>
          <button className="lobby-primary-button" type="submit">Sign in</button>
        </form>
      ) : (
        <form onSubmit={handleSignUp}>
          <Field label="Player name">
            <input
              maxLength={16}
              onChange={(event) => setSignUpName(event.target.value)}
              placeholder="e.g. CircuitBreaker"
              type="text"
              value={signUpName}
            />
          </Field>
          <Field label="Email">
            <input
              autoComplete="email"
              onChange={(event) => setSignUpEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={signUpEmail}
            />
          </Field>
          <Field label="Password">
            <input
              autoComplete="new-password"
              onChange={(event) => setSignUpPassword(event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={signUpPassword}
            />
          </Field>
          <button className="lobby-primary-button" type="submit">Create account</button>
        </form>
      )}

      <div className="lobby-divider"><span />OR<span /></div>
      <button className="lobby-secondary-button" onClick={handleGuest} type="button">
        Continue as guest
      </button>
    </section>
  )
}

function LobbyScreen({
  me,
  gameCode,
  onLeave,
  onStartGame,
}: {
  me: Omit<Player, 'color'>
  gameCode: string
  onLeave: () => void
  onStartGame: () => void
}) {
  const [players, setPlayers] = useState<Player[]>([
    { ...me, color: 'blue' },
  ])
  const [joinedCount, setJoinedCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const canStart = players.length >= 2

  function simulateJoin() {
    if (players.length >= 8) return
    const color = BOT_COLORS[joinedCount % BOT_COLORS.length] ?? 'red'
    const name = BOT_NAMES[joinedCount % BOT_NAMES.length] ?? 'RoboPlayer'
    setPlayers((currentPlayers) => [...currentPlayers, { name, color, tag: 'PLAYER' }])
    setJoinedCount((count) => count + 1)
  }

  async function copyCode() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(gameCode)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section className="lobby-panel lobby-panel--wide">
      <header className="lobby-header">
        <div>
          <div className="lobby-code-label">GAME CODE</div>
          <div className="lobby-code">{gameCode}</div>
        </div>
        <div className="lobby-header-actions">
          <button className="lobby-copy-button" onClick={copyCode} type="button">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="lobby-leave-button" onClick={onLeave} type="button">
            Leave lobby
          </button>
        </div>
      </header>

      <p className="lobby-status">
        Waiting for players · <strong>{players.length}</strong>/8 joined
      </p>

      <div className="lobby-player-list">
        {players.map((player) => (
          <div className="lobby-player-row" key={player.name}>
            <BotIcon color={player.color} />
            <span className="lobby-player-name">{player.name}</span>
            <span className="lobby-player-tag">{player.tag}</span>
          </div>
        ))}
        {Array.from({ length: 8 - players.length }, (_, index) => (
          <div className="lobby-player-row lobby-player-row--empty" key={`empty-${index}`}>
            Open slot
          </div>
        ))}
      </div>

      <div className="lobby-actions">
        <button className="lobby-secondary-button" onClick={simulateJoin} type="button">
          Simulate player joining
        </button>
        <button
          className="lobby-primary-button"
          disabled={!canStart}
          onClick={onStartGame}
          type="button"
        >
          Start game
        </button>
      </div>
      <p className="lobby-hint">
        {canStart ? `All set — ${players.length} players ready.` : 'Need at least 2 players to start.'}
      </p>
    </section>
  )
}

export default function Lobby({ onStartGame }: LobbyProps) {
  const [view, setView] = useState<'auth' | 'lobby'>('auth')
  const [me, setMe] = useState<Omit<Player, 'color'>>({ name: 'You', tag: 'HOST' })
  const [gameCode] = useState(createGameCode)

  function enterLobby(player: Omit<Player, 'color'>) {
    setMe(player)
    setView('lobby')
  }

  return (
    <main className="lobby">
      <BoardBackground />
      {view === 'auth' ? (
        <AuthScreen onEnterLobby={enterLobby} />
      ) : (
        <LobbyScreen
          gameCode={gameCode}
          me={me}
          onLeave={() => setView('auth')}
          onStartGame={onStartGame}
        />
      )}
    </main>
  )
}
