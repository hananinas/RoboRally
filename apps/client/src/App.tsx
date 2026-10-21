import { useCallback, useEffect, useRef, useState } from 'react'
import type { LobbySummary, ServerToClientEvents } from '@robo-rally/game-events'
import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import useGameConnection from './scenes/active-game/useGameConnection.ts'
import Login from './scenes/login/Login.tsx'
import EntryScreen from './scenes/login/EntryScreen.tsx'
import LobbyScreen from './scenes/login/LobbyScreen.tsx'
import WaitingLobby from './scenes/login/WaitingLobby.tsx'
import { USER_ALREADY_IN_GAME_MESSAGE } from './scenes/active-game/gameState.ts'
import { createSessionState, sessionReducer, type SessionEvent } from './sessionState.ts'
import useGameSocket, { ACKNOWLEDGEMENT_TIMEOUT_MS } from './useGameSocket.ts'

function errorMessage(code: string): string {
  switch (code) {
    case 'USER_ALREADY_IN_SESSION': return USER_ALREADY_IN_GAME_MESSAGE
    case 'INVALID_USERNAME': return 'Username must contain 1–30 characters.'
    case 'ALREADY_LOGGED_IN': return 'This connection is already logged in with another username. Retry connection to use this name.'
    case 'LOBBY_NOT_FOUND': return 'This lobby is no longer available. Refresh and try again.'
    case 'LOBBY_FULL': return 'This lobby is full. Choose another lobby.'
    case 'TIMEOUT': return 'The Game Service did not respond. Please try again.'
    default: return `The request could not be completed (${code}). Please try again.`
  }
}

function App() {
  const connection = useGameSocket()
  const { socket } = connection
  const game = useGameConnection(socket)
  const { initialize, dispatch: dispatchGame } = game
  const [session, setSession] = useState(createSessionState)
  const current = useRef(session)
  const generation = useRef(0)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [lobbies, setLobbies] = useState<readonly LobbySummary[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const listAttempt = useRef(0)

  // Update event-time state before the next Socket.IO packet is handled.
  const dispatch = useCallback((event: SessionEvent) => {
    const next = sessionReducer(current.current, event)
    if (event.type === 'game-started' && next !== current.current && next.status === 'joined') initialize(event.initialization)
    if (event.type === 'session-result' && next.status === 'joined' && event.result.outcome === 'IN_GAME') initialize(event.result.initialization)
    if (event.type === 'left' || (event.type === 'session-result' && event.result.outcome === 'NO_SESSION')) dispatchGame({ type: 'reset' })
    current.current = next
    setSession(next)
  }, [initialize, dispatchGame])

  const run = useCallback(async (operation: () => Promise<SessionEvent | undefined>, timeout: 'login' | 'sync' | 'command' | 'start' = 'command') => {
    if (pending.current || !socket.connected) return
    pending.current = true
    setBusy(true)
    const attempt = generation.current
    try {
      const event = await operation()
      if (generation.current === attempt && socket.connected && event) dispatch(event)
    } catch {
      if (generation.current === attempt && socket.connected && !(timeout === 'start' && current.current.status === 'joined')) {
        dispatch(timeout === 'login' ? { type: 'login-error', error: 'TIMEOUT' }
          : timeout === 'sync' ? { type: 'error', error: 'TIMEOUT' } : { type: 'sync-requested' })
      }
    } finally {
      if (generation.current === attempt) {
        pending.current = false
        setBusy(false)
      }
    }
  }, [socket, dispatch])

  useEffect(() => {
    const disconnected = () => {
      generation.current += 1
      listAttempt.current += 1
      pending.current = false
      setBusy(false)
      dispatch({ type: 'disconnected' })
    }
    const connected = () => {
      if ('user' in current.current && !(current.current.status === 'joined' && socket.recovered)) dispatch({ type: 'sync-requested' })
    }
    const started: ServerToClientEvents['game.started'] = (payload) => {
      if (socket.connected) dispatch({ type: 'game-started', ...payload })
    }
    const updated: ServerToClientEvents['lobby.updated'] = ({ lobby }) => {
      if (socket.connected) dispatch({ type: 'lobby-updated', lobby })
    }
    socket.on('disconnect', disconnected)
    socket.on('connect', connected)
    socket.on('game.started', started)
    socket.on('lobby.updated', updated)
    return () => {
      socket.off('disconnect', disconnected)
      socket.off('connect', connected)
      socket.off('game.started', started)
      socket.off('lobby.updated', updated)
      generation.current += 1
    }
  }, [socket, dispatch])

  useEffect(() => {
    if (session.status !== 'resyncing' || !socket.connected || busy) return
    const attempt = generation.current
    void run(async () => {
      const login = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('user.login', { username: session.user.username })
      if (attempt !== generation.current || !socket.connected) return
      if (login.outcome !== 'LOGGED_IN') return { type: 'login-result', result: login }
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('session.get', {})
      return { type: 'session-result', result }
    }, 'sync')
  }, [session, socket, connection.status, busy, run])

  const refresh = useCallback(() => {
    if (!socket.connected) return
    const attempt = ++listAttempt.current
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('lobby.list', {}, (error, result) => {
      if (attempt !== listAttempt.current || !socket.connected || current.current.status !== 'browsing') return
      if (error) setListError('TIMEOUT')
      else if (result.outcome === 'LOBBIES_FOUND') {
        setListError(null)
        setLobbies(result.lobbies)
      }
      else setListError(result.outcome)
    })
  }, [socket])
  useEffect(() => {
    if (session.status === 'browsing') refresh()
  }, [session.status, refresh])

  function submitUsername(username: string) {
    if (current.current.status !== 'editing' || pending.current) return
    if (current.current.error === 'ALREADY_LOGGED_IN') {
      socket.disconnect()
      socket.connect()
      return
    }
    if (!socket.connected) return connection.connect()
    dispatch({ type: 'username-changed', username })
    dispatch({ type: 'login-submitted' })
    void run(async () => ({ type: 'login-result', result: await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('user.login', { username }) }), 'login')
  }
  function join(lobbyId: string | null) {
    if (pending.current || !socket.connected) return
    dispatch({ type: 'lobby-requested', lobbyId })
    void run(async () => ({ type: 'lobby-result', result: lobbyId === null
      ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.create', {})
      : await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.join', { lobbyId }) }))
  }
  function start() {
    if (session.status !== 'waiting') return
    const lobbyId = session.lobby.lobbyId
    void run(async () => {
      const result = await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.start', { lobbyId })
      if (result.outcome === 'STARTED' && current.current.status === 'joined') return
      return result.outcome === 'STARTED' || result.outcome === 'LOBBY_NOT_FOUND'
        ? { type: 'sync-requested' } : { type: 'error', error: result.outcome }
    }, 'start')
  }
  function leave() {
    void run(async () => {
      const result = session.status === 'waiting'
        ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('lobby.leave', { lobbyId: session.lobby.lobbyId })
        : game.state.assignment
          ? await socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emitWithAck('game.leave', { gameId: game.state.assignment.gameId }) : undefined
      return result?.outcome === 'LEFT' || result?.outcome === 'GAME_NOT_FOUND'
        ? { type: 'left' } : { type: 'sync-requested' }
    })
  }

  if ((session.status === 'joined' || session.status === 'resyncing') && game.state.assignment) {
    return <ActiveGame game={game} username={session.user.username} leaving={busy} onLeave={leave} />
  }
  const error = 'error' in session && session.error ? errorMessage(session.error) : listError ? errorMessage(listError) : connection.error
  return <EntryScreen>
    {session.status === 'editing' || session.status === 'logging-in'
      ? <Login connectionStatus={connection.status} error={error} onSubmitUsername={submitUsername}
          onUsernameChange={(username) => dispatch({ type: 'username-changed', username })}
          pending={session.status === 'logging-in'} requiresReconnect={session.status === 'editing' && session.error === 'ALREADY_LOGGED_IN'} username={session.username} />
      : <>
        {error && session.status !== 'browsing' && session.status !== 'joining' && <p role="alert" className="login-validation login-validation--error">{error}</p>}
        {session.status === 'browsing' || session.status === 'joining'
          ? <LobbyScreen username={session.user.username} error={error} lobbies={lobbies} pending={busy || session.status === 'joining'} connected={socket.connected}
              onCreate={() => join(null)} onJoin={join} onRefresh={refresh} />
          : session.status === 'waiting'
            ? <WaitingLobby lobby={session.lobby} userId={session.user.userId} disabled={busy || !socket.connected} onStart={start} onLeave={leave} />
            : <><p>Restoring session…</p><button className="login-secondary-button" type="button" disabled={busy || !socket.connected} onClick={() => dispatch({ type: 'sync-requested' })}>Retry</button></>}
      </>}
  </EntryScreen>
}
export default App
