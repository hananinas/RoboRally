import { useReducer, useRef } from 'react'
import Lobby from './scenes/lobby/Lobby.tsx'
import {
  createSessionState,
  sessionReducer,
  type LoginError,
} from './sessionState.ts'
import useGameSocket, { ACKNOWLEDGEMENT_TIMEOUT_MS } from './useGameSocket.ts'

const loginErrors: Record<LoginError, string> = {
  INVALID_USERNAME: 'Username must contain 1–30 characters.',
  INVALID_REQUEST: 'The login request was rejected. Please try again.',
  ALREADY_LOGGED_IN: 'This connection is already logged in with another username.',
  INTERNAL_ERROR: 'The Game Service could not log you in. Please try again.',
  LOGIN_REQUIRED: 'Your login is no longer valid. Please log in again.',
  TIMEOUT: 'The Game Service did not respond. Please try again.',
}

function App() {
  const connection = useGameSocket()
  const [session, dispatch] = useReducer(sessionReducer, undefined, createSessionState)
  const loginPending = useRef(false)
  const loginAttempt = useRef(0)

  const username = session.status === 'editing' || session.status === 'logging-in'
    ? session.username
    : session.user.username
  const pending = session.status === 'logging-in' || session.status === 'joining'
  const sessionError = session.status === 'editing' && session.error
    ? loginErrors[session.error]
    : null

  function submitUsername(submittedUsername: string) {
    if (session.status !== 'editing' || loginPending.current) return
    if (connection.status !== 'connected') {
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
        if (attempt !== loginAttempt.current) return
        loginPending.current = false
        dispatch(error
          ? { type: 'login-timeout' }
          : { type: 'login-result', result })
      },
    )
  }

  return (
    <Lobby
      connectionStatus={connection.status}
      error={sessionError ?? connection.error}
      onSubmitUsername={submitUsername}
      onUsernameChange={(nextUsername) => dispatch({
        type: 'username-changed', username: nextUsername,
      })}
      pending={pending}
      pendingLabel={session.status === 'joining' ? 'Joining game…' : 'Logging in…'}
      username={username}
    />
  )
}

export default App
