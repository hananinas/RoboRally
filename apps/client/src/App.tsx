import type { ReactNode } from 'react'
import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import Login from './scenes/login/Login.tsx'
import EntryScreen from './scenes/login/EntryScreen.tsx'
import LobbyScreen from './scenes/login/LobbyScreen.tsx'
import WaitingLobby from './scenes/login/WaitingLobby.tsx'
import RobotPicker from './scenes/login/RobotPicker.tsx'
import { USER_ALREADY_IN_GAME_MESSAGE } from './scenes/active-game/gameState.ts'
import useSessionConnection from './useSessionConnection.ts'

function errorMessage(code: string): string {
  switch (code) {
    case 'USER_ALREADY_IN_SESSION': return USER_ALREADY_IN_GAME_MESSAGE
    case 'INVALID_USERNAME': return 'Username must contain 1–30 characters.'
    case 'ALREADY_LOGGED_IN': return 'This connection is already logged in with another username. Retry connection to use this name.'
    case 'LOBBY_NOT_FOUND': return 'This lobby is no longer available. Refresh and try again.'
    case 'LOBBY_MEMBER_DISCONNECTED': return 'A player disconnected before the game could start. Please try again.'
    case 'LOBBY_FULL': return 'This lobby is full. Choose another lobby.'
    case 'TIMEOUT': return 'The Game Service did not respond. Please try again.'
    default: return 'The request could not be completed. Please try again.'
  }
}

function App() {
  const {
    connection, game, session, busy, lobbies, listError,
    submitUsername, changeUsername, createLobby, joinLobby,
    startLobby, leaveSession, refreshLobbies, retrySession,
  } = useSessionConnection()

  // Keep the existing game visible while session.get restores membership after reconnecting.
  if ((session.status === 'joined' || session.status === 'resyncing') && game.state.assignment) {
    return <ActiveGame game={game} username={session.user.username} leaving={busy} onLeave={leaveSession} />
  }

  const browsing = session.status === 'browsing' || session.status === 'joining'
  const errorCode = ('error' in session && session.error) || (browsing && listError)
  const error = errorCode ? errorMessage(errorCode) : connection.error
  let content: ReactNode
  if (session.status === 'editing' || session.status === 'logging-in') {
    content = <Login
      connectionStatus={connection.status}
      error={error}
      onSubmitUsername={submitUsername}
      onUsernameChange={changeUsername}
      pending={session.status === 'logging-in'}
      requiresReconnect={session.status === 'editing' && session.error === 'ALREADY_LOGGED_IN'}
      username={session.username}
    />
  } else if (session.status === 'browsing' || session.status === 'joining') {
    content = <LobbyScreen
      username={session.user.username} error={error} lobbies={lobbies}
      pending={busy || session.status === 'joining'} connected={connection.status === 'connected'}
      onCreate={createLobby} onJoin={joinLobby} onRefresh={refreshLobbies}
    />
  } else if (session.status === 'waiting') {
    content = <WaitingLobby
      lobby={session.lobby} userId={session.user.userId} disabled={busy || connection.status !== 'connected'}
      onStart={startLobby} onLeave={leaveSession}
    />
  } else {
    content = <>
      <p>Restoring session…</p>
      <button className="login-secondary-button" type="button" disabled={busy || connection.status !== 'connected'} onClick={retrySession}>Retry</button>
    </>
  }
  return <EntryScreen aside={session.status === 'waiting' ? <RobotPicker /> : undefined}>
    {error && (session.status === 'waiting' || session.status === 'resyncing' || session.status === 'sync-failed') &&
      <p role="alert" className="login-validation login-validation--error">{error}</p>}
    {content}
  </EntryScreen>
}
export default App
