import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import useGameConnection from './scenes/active-game/useGameConnection.ts'
import { useEffect, useReducer, useRef, useState } from 'react'
import Login from './scenes/login/Login.tsx'
import {
  createSessionState,
  sessionReducer,
  type JoinError,
  type LoginError,
} from './sessionState.ts'
import useGameSocket, { ACKNOWLEDGEMENT_TIMEOUT_MS } from './useGameSocket.ts'

const loginErrors: Record<LoginError, string> = {
  INVALID_USERNAME: 'Username must contain 1–30 characters.',
  INVALID_REQUEST: 'The login request was rejected. Please try again.',
  ALREADY_LOGGED_IN: 'This connection is already logged in with another username. Retry connection to use this name.',
  INTERNAL_ERROR: 'The Game Service could not log you in. Please try again.',
  LOGIN_REQUIRED: 'Your login is no longer valid. Please log in again.',
  TIMEOUT: 'The Game Service did not respond. Please try again.',
}

const joinErrors: Record<JoinError, string> = {
  INVALID_REQUEST: 'The configured game ID is invalid.',
  GAME_NOT_FOUND: 'The configured game could not be found.',
  NO_SPAWN_AVAILABLE: 'The game has no available spawn position.',
  USER_ALREADY_IN_GAME: 'This username is already participating from another connection.',
  GAME_ALREADY_STARTED: 'The game has already started and is no longer accepting new players.',
  INTERNAL_ERROR: 'The Game Service could not join the game. Please try again.',
  CONNECTION_ERROR: 'Connection lost before the game could be joined.',
  GAME_ID_MISSING: 'Set VITE_GAME_ID to the shared game ID and restart the client.',
  TIMEOUT: 'The Game Service did not respond to the join request. Please try again.',
}

function App() {
  const connection = useGameSocket()
  const game = useGameConnection(connection.socket)
  const { initialize } = game
  const [session, dispatch] = useReducer(sessionReducer, undefined, createSessionState)
  const loginPending = useRef(false)
  const loginAttempt = useRef(0)
  const joinPending = useRef(false)
  const joinAttempt = useRef(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const invalidateRequests = () => {
      loginAttempt.current += 1
      joinAttempt.current += 1
      loginPending.current = false
      joinPending.current = false
    }
    const handleDisconnect = () => {
      invalidateRequests()
      dispatch({ type: 'disconnected' })
    }
    connection.socket.on('disconnect', handleDisconnect)
    return () => {
      connection.socket.off('disconnect', handleDisconnect)
      invalidateRequests()
    }
  }, [connection.socket])

  useEffect(() => {
    if (session.status !== 'joining' || joinPending.current) return
    const gameId = import.meta.env.VITE_GAME_ID
    if (!gameId) {
      dispatch({ type: 'join-error', error: 'GAME_ID_MISSING' })
      return
    }
    if (!connection.socket.connected) {
      dispatch({ type: 'join-error', error: 'CONNECTION_ERROR' })
      return
    }

    joinPending.current = true
    const attempt = ++joinAttempt.current
    connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
      'game.join',
      { gameId },
      (error, result) => {
        if (attempt !== joinAttempt.current || !connection.socket.connected) return
        joinPending.current = false
        if (!error && result.outcome === 'JOINED') initialize(result)
        dispatch(error
          ? { type: 'join-error', error: 'TIMEOUT' }
          : { type: 'join-result', result })
      },
    )
  }, [connection.socket, connection.status, session.status, initialize])

  const username = session.status === 'editing' || session.status === 'logging-in'
    ? session.username
    : session.user.username
  const pending = session.status === 'logging-in'
    || session.status === 'joining'
    || session.status === 'joined'
  const sessionError = session.status === 'editing' && session.error
    ? loginErrors[session.error]
    : session.status === 'join-failed' && session.error ? joinErrors[session.error] : null
  const requiresReconnect = session.status === 'editing' && session.error === 'ALREADY_LOGGED_IN'

  function submitUsername(submittedUsername: string) {
    if (session.status === 'join-failed') {
      if (!connection.socket.connected) {
        connection.connect()
        return
      }
      dispatch({ type: 'join-retried' })
      return
    }
    if (session.status !== 'editing' || loginPending.current) return
    if (requiresReconnect) {
      connection.socket.disconnect()
      connection.connect()
      return
    }
    if (!connection.socket.connected) {
      connection.connect()
      return
    }

    loginPending.current = true
    const attempt = ++loginAttempt.current
    dispatch({ type: 'username-changed', username: submittedUsername })
    dispatch({ type: 'login-submitted' })
    connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
      'user.login',
      { username: submittedUsername },
      (error, result) => {
        if (attempt !== loginAttempt.current || !connection.socket.connected) return
        loginPending.current = false
        dispatch(error
          ? { type: 'login-timeout' }
          : { type: 'login-result', result })
      },
    )
  }

  function leaveGame() {
    if (leaving || !connection.socket.connected || !game.state.assignment) return
    setLeaving(true)
    connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
      'game.leave', { gameId: game.state.assignment.gameId }, (error, result) => {
        if (!error && (result.outcome === 'LEFT' || result.outcome === 'GAME_NOT_FOUND')) {
          game.dispatch({ type: 'reset' })
          dispatch({ type: 'left' })
          setLeaving(false)
        } else {
          game.dispatch({ type: 'error', message: 'Could not confirm leaving the game. Reload to continue.' })
        }
      },
    )
  }

  if (session.status === 'joined') {
    return <ActiveGame game={game} username={session.user.username} leaving={leaving} onLeave={leaveGame} />
  }

  return (
    <Login
      connectionStatus={connection.status}
      error={sessionError ?? connection.error}
      onSubmitUsername={submitUsername}
      onUsernameChange={(nextUsername) => dispatch({
        type: 'username-changed', username: nextUsername,
      })}
      pending={pending}
      pendingLabel={session.status === 'logging-in' ? 'Logging in…'
        : 'Joining game…'}
      retryingJoin={session.status === 'join-failed'}
      requiresReconnect={requiresReconnect}
      usernameLocked={session.status !== 'editing'}
      username={username}
    />
  )
}

export default App
