import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import useGameConnection from './scenes/active-game/useGameConnection.ts'
import { useEffect, useReducer, useRef, useState } from 'react'
import type {
  CreateLobby,
  LobbyCreateResult,
  LobbyJoinResult,
  LobbySummary,
} from '@robo-rally/game-events'
import Login from './scenes/login/Login.tsx'
import LobbyPicker from './scenes/lobby-picker/LobbyPicker.tsx'
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

const createLobbyErrors: Record<Exclude<LobbyCreateResult['outcome'], 'LOBBY_CREATED'>, string> = {
  LOGIN_REQUIRED: 'Log in again before creating a lobby.',
  INVALID_REQUEST: 'Enter a valid lobby name, code, and map.',
  LOBBY_CODE_TAKEN: 'That lobby number is already in use. Generate a new one.',
  INTERNAL_ERROR: 'The Game Service could not create the lobby.',
}

const joinLobbyErrors: Record<Exclude<LobbyJoinResult['outcome'], 'LOBBY_JOINED'>, string> = {
  LOGIN_REQUIRED: 'Log in again before joining a lobby.',
  INVALID_REQUEST: 'That lobby number is invalid.',
  LOBBY_NOT_FOUND: 'No lobby has that number.',
  LOBBY_FULL: 'That lobby is full.',
  ALREADY_IN_LOBBY: 'You are already in a different lobby.',
  INTERNAL_ERROR: 'The Game Service could not join the lobby.',
}

function App() {
  const connection = useGameSocket()
  const game = useGameConnection(connection.socket)
  const { initialize } = game
  const [session, dispatch] = useReducer(sessionReducer, undefined, createSessionState)
  const [lobbies, setLobbies] = useState<readonly LobbySummary[]>([])
  const [joinedLobby, setJoinedLobby] = useState<LobbySummary | null>(null)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [lobbyPending, setLobbyPending] = useState(false)
  const loginPending = useRef(false)
  const loginAttempt = useRef(0)
  const joinPending = useRef(false)
  const joinAttempt = useRef(0)

  useEffect(() => {
    const invalidateRequests = () => {
      loginAttempt.current += 1
      joinAttempt.current += 1
      loginPending.current = false
      joinPending.current = false
    }
    const handleDisconnect = () => {
      invalidateRequests()
      setJoinedLobby(null)
      dispatch({ type: 'disconnected' })
    }
    const handleLobbyListUpdated = (nextLobbies: readonly LobbySummary[]) => {
      setLobbies(nextLobbies)
      setJoinedLobby((current) => current
        ? nextLobbies.find((lobby) => lobby.lobbyId === current.lobbyId) ?? current
        : null)
    }
    connection.socket.on('disconnect', handleDisconnect)
    connection.socket.on('lobby.listUpdated', handleLobbyListUpdated)
    return () => {
      connection.socket.off('disconnect', handleDisconnect)
      connection.socket.off('lobby.listUpdated', handleLobbyListUpdated)
      invalidateRequests()
    }
  }, [connection.socket])

  useEffect(() => {
    const countdownEndsAt = joinedLobby?.countdownEndsAt
    if (session.status !== 'joining' || !countdownEndsAt || joinPending.current) return
    const gameId = import.meta.env.VITE_GAME_ID
    const timer = window.setTimeout(() => {
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
          if (!error && result.outcome === 'LOGIN_REQUIRED') setJoinedLobby(null)
          dispatch(error
            ? { type: 'join-error', error: 'TIMEOUT' }
            : { type: 'join-result', result })
        },
      )
    }, Math.max(0, countdownEndsAt - Date.now()))

    return () => window.clearTimeout(timer)
  }, [connection.socket, connection.status, session.status, initialize, joinedLobby?.countdownEndsAt])

  const username = session.status === 'editing' || session.status === 'logging-in'
    ? session.username
    : session.user.username
  const pending = session.status === 'logging-in'
    || session.status === 'joining'
    || session.status === 'joined'
  const sessionError = session.status === 'editing' && session.error
    ? loginErrors[session.error]
    : session.status === 'join-failed' ? joinErrors[session.error] : null
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
        if (error || result.outcome !== 'LOGGED_IN') return

        setLobbyError(null)
        connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit(
          'lobby.list',
          (listError, listResult) => {
            if (listError) {
              setLobbyError('The Game Service did not respond while loading lobbies.')
            } else if (listResult.outcome === 'LOBBIES_LISTED') {
              setLobbies(listResult.lobbies)
            } else {
              dispatch({ type: 'disconnected' })
            }
          },
        )
      },
    )
  }

  function createLobby(lobby: CreateLobby) {
    if (!connection.socket.connected) {
      setLobbyError('Connection lost. Log in again to create a lobby.')
      return
    }
    setLobbyPending(true)
    setLobbyError(null)
    connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('lobby.create', lobby, (error, result) => {
      setLobbyPending(false)
      if (error) {
        setLobbyError('The Game Service did not respond. Try creating the lobby again.')
      } else if (result.outcome === 'LOBBY_CREATED') {
        setLobbies((current) => [result.lobby, ...current.filter((item) => item.lobbyId !== result.lobby.lobbyId)])
        setJoinedLobby(result.lobby)
      } else {
        setLobbyError(createLobbyErrors[result.outcome])
      }
    })
  }

  function joinLobby(code: string) {
    if (!connection.socket.connected) {
      setLobbyError('Connection lost. Log in again to join the lobby.')
      return
    }
    setLobbyPending(true)
    setLobbyError(null)
    connection.socket.timeout(ACKNOWLEDGEMENT_TIMEOUT_MS).emit('lobby.join', { code }, (error, result) => {
      setLobbyPending(false)
      if (error) {
        setLobbyError('The Game Service did not respond. Try joining the lobby again.')
      } else if (result.outcome === 'LOBBY_JOINED') {
        setLobbies((current) => current.map((lobby) => lobby.lobbyId === result.lobby.lobbyId ? result.lobby : lobby))
        setJoinedLobby(result.lobby)
      } else {
        setLobbyError(joinLobbyErrors[result.outcome])
      }
    })
  }

  if (session.status === 'joined') {
    return <ActiveGame game={game} username={session.user.username} />
  }

  if (session.status === 'joining') {
    return (
      <LobbyPicker
        actionError={lobbyError}
        actionPending={lobbyPending}
        lobbies={lobbies}
        onCreateLobby={createLobby}
        onJoinLobby={joinLobby}
        waitingLobby={joinedLobby}
        username={session.user.username}
      />
    )
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
