import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import useGameConnection from './scenes/active-game/useGameConnection.ts'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Login from './scenes/login/Login.tsx'
import EntryScreen from './scenes/login/EntryScreen.tsx'
import JoinGame from './scenes/login/JoinGame.tsx'
import type { GameId } from '@robo-rally/game-events'
import { USER_ALREADY_IN_GAME_MESSAGE } from './scenes/active-game/gameState.ts'
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
  NO_SPAWN_AVAILABLE: 'The game has no available spawn position.',
  USER_ALREADY_IN_GAME: USER_ALREADY_IN_GAME_MESSAGE,
  GAME_ALREADY_STARTED: 'The game has already started and is no longer accepting new players.',
  INTERNAL_ERROR: 'The Game Service could not join the game. Please try again.',
  CONNECTION_ERROR: 'Connection lost before the game could be joined.',
  INVALID_REQUEST: 'The join request was rejected. Refresh the lobby and try again.',
  GAME_NOT_FOUND: 'This game no longer exists. Refresh the lobby and try again.',
  TIMEOUT: 'The Game Service did not respond to the join request. Please try again.',
}

function App() {
  const connection = useGameSocket()
  const game = useGameConnection(connection.socket)
  const { initialize } = game
  const [session, dispatch] = useReducer(sessionReducer, undefined, createSessionState)
  const sessionRef = useRef(session)
  const loginPending = useRef(false)
  const loginAttempt = useRef(0)
  const joinPending = useRef(false)
  const joinAttempt = useRef(0)
  const [leaving, setLeaving] = useState(false)

  const sendLogin = useCallback((username: string) => {
    loginPending.current = true
    const attempt = ++loginAttempt.current
    connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
      'user.login',
      { username },
      (error, result) => {
        if (attempt !== loginAttempt.current || !connection.socket.connected) return
        loginPending.current = false
        dispatch(error
          ? { type: 'login-timeout' }
          : { type: 'login-result', result })
      },
    )
  }, [connection.socket, dispatch])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

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
    const handleConnect = () => {
      if (sessionRef.current.status === 'joined' && !connection.socket.recovered) {
        dispatch({ type: 'resync' })
      }
    }
    connection.socket.on('disconnect', handleDisconnect)
    connection.socket.on('connect', handleConnect)
    return () => {
      connection.socket.off('disconnect', handleDisconnect)
      connection.socket.off('connect', handleConnect)
      invalidateRequests()
    }
  }, [connection.socket])

  useEffect(() => {
    if (session.status !== 'joining' || joinPending.current) return
    const {gameId} = session
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
  }, [connection.socket, connection.status, session, initialize])

  useEffect(() => {
    if (session.status !== 'resyncing' || loginPending.current) return
    sendLogin(session.user.username)
  }, [connection.socket, session, sendLogin])

  const username = session.status === 'editing' || session.status === 'logging-in'
    ? session.username
    : session.user.username
  const sessionError = session.status === 'editing' && session.error
    ? loginErrors[session.error]
    : session.status === 'join-failed' && session.error ? joinErrors[session.error] : null
  const requiresReconnect = session.status === 'editing' && session.error === 'ALREADY_LOGGED_IN'

  function submitUsername(submittedUsername: string) {
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

    dispatch({ type: 'username-changed', username: submittedUsername })
    dispatch({ type: 'login-submitted' })
    sendLogin(submittedUsername)
  }

  function joinGame(gameId: GameId) {
    if (session.status !== 'ready-to-join' && session.status !== 'join-failed') return
    if (!connection.socket.connected) return
    dispatch({ type: 'join-requested', gameId })
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

  if (session.status === 'joined' || session.status === 'resyncing') {
    return <ActiveGame game={game} username={session.user.username} leaving={leaving} onLeave={leaveGame} />
  }

  return (
    <EntryScreen>
      {session.status === 'editing' || session.status === 'logging-in' ? (
        <Login
          connectionStatus={connection.status}
          error={sessionError ?? connection.error}
          onSubmitUsername={submitUsername}
          onUsernameChange={(nextUsername) => dispatch({
            type: 'username-changed', username: nextUsername,
          })}
          pending={session.status === 'logging-in'}
          requiresReconnect={requiresReconnect}
          username={username}
        />
      ) : (
        <JoinGame
          socket={connection.socket}
          username={username}
          pending={session.status === 'joining'}
          connected={connection.status === 'connected'}
          error={sessionError ?? connection.error}
          onJoin={joinGame}
        />
      )}
    </EntryScreen>
  )
}

export default App
