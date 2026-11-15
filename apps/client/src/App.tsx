import type { ReactNode } from 'react'
import { useEffect } from 'react'
import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import EntryScreen from './scenes/entry/EntryScreen.tsx'
import LobbyMapPanel from './scenes/entry/LobbyMapPanel.tsx'
import LobbyScreen from './scenes/entry/LobbyScreen.tsx'
import WaitingLobby from './scenes/entry/WaitingLobby.tsx'
import RobotPicker from './scenes/entry/RobotPicker.tsx'
import { USER_ALREADY_IN_GAME_MESSAGE } from './scenes/active-game/gameState.ts'
import useSessionConnection from './useSessionConnection.ts'

function errorMessage(code: string): string {
  switch (code) {
    case 'USER_ALREADY_IN_SESSION': return USER_ALREADY_IN_GAME_MESSAGE
    case 'LOBBY_NOT_FOUND': return 'This lobby is no longer available. Refresh and try again.'
    case 'LOBBY_MEMBER_DISCONNECTED': return 'A player disconnected before the game could start. Please try again.'
    case 'LOBBY_FULL': return 'This lobby is full. Choose another lobby.'
    case 'TIMEOUT': return 'The Game Service did not respond. Please try again.'
    default: return 'The request could not be completed. Please try again.'
  }
}

function App() {
  const {
    connection, game, session, busy, lobbies, maps, mapsLoaded, listError,
    createLobby, joinLobby, startLobby, leaveSession, refreshLobbies, retrySession, selectRobot,
  } = useSessionConnection()

  useEffect(() => {
    if (connection.status === 'unauthenticated') window.location.href = '/auth/login'
  }, [connection.status])

  const logout = () => { window.location.href = '/auth/logout' }
  const openSettings = () => { window.location.href = '/auth/settings' }

  // Keep the existing game visible while session.get restores membership after reconnecting.
  if ((session.status === 'joined' || session.status === 'resyncing') && session.user && game.state.assignment) {
    return <ActiveGame game={game} username={session.user.username} leaving={busy} onLeave={leaveSession} onLogout={logout} onSettings={openSettings} />
  }

  if (connection.status === 'unauthenticated') {
    return <EntryScreen><p>Redirecting to login…</p></EntryScreen>
  }

  const browsing = session.status === 'browsing' || session.status === 'joining'
  const errorCode = ('error' in session && session.error) || (browsing && listError)
  const error = errorCode ? errorMessage(errorCode) : connection.error
  let content: ReactNode
  if (session.status === 'browsing' || session.status === 'joining') {
    content = <LobbyScreen
      username={session.user.username} error={error} lobbies={lobbies} maps={maps} mapsLoaded={mapsLoaded}
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
      <button className="entry-secondary-button" type="button" disabled={busy || connection.status === 'connecting'} onClick={retrySession}>Retry</button>
    </>
  }
  return (
    <EntryScreen
      onLogout={connection.status === 'connected' || session.user ? logout : undefined}
      onSettings={openSettings}
      aside={session.status === 'waiting' ? (
        <>
          <aside className="entry-panel" aria-label="Your robot">
            <RobotPicker
              robots={session.lobby.robots}
              selectedRobotId={session.lobby.players.find((player) => player.userId === session.user.userId)?.robotSpriteId
                ?? session.lobby.robots.find((robot) => robot.defaultForLobbyCreation)?.id
                ?? ''}
              disabled={busy || connection.status !== 'connected'}
              onSelect={selectRobot}
            />
          </aside>
          <LobbyMapPanel lobby={session.lobby} />
        </>
      ) : undefined}
    >
      {error && (session.status === 'waiting' || session.status === 'resyncing' || session.status === 'sync-failed') &&
        <p role="alert" className="entry-validation entry-validation--error">{error}</p>}
      {content}
    </EntryScreen>
  )
}
export default App
