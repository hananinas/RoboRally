import type { ReactNode } from 'react'
import { useEffect } from 'react'
import ActiveGame from './scenes/active-game/ActiveGame.tsx'
import EntryScreen from './scenes/entry/EntryScreen.tsx'
import LobbyMapPanel from './scenes/entry/LobbyMapPanel.tsx'
import LobbyScreen from './scenes/entry/LobbyScreen.tsx'
import WaitingLobby from './scenes/entry/WaitingLobby.tsx'
import RobotPicker from './scenes/entry/RobotPicker.tsx'
import { USER_ALREADY_IN_GAME_MESSAGE } from './scenes/active-game/gameState.ts'
import useMembershipConnection from './useMembershipConnection.ts'

function errorMessage(code: string): string {
  switch (code) {
    case 'ALREADY_HAS_MEMBERSHIP': return USER_ALREADY_IN_GAME_MESSAGE
    case 'LOBBY_NOT_FOUND': return 'This lobby is no longer available. Refresh and try again.'
    case 'LOBBY_MEMBER_DISCONNECTED': return 'A player disconnected before the game could start. Please try again.'
    case 'LOBBY_FULL': return 'This lobby is full. Choose another lobby.'
    case 'TIMEOUT': return 'The Game Service did not respond. Please try again.'
    case 'COLOUR_TAKEN': return 'That color was selected by another player. Please choose a different color.'
    default: return 'The request could not be completed. Please try again.'
  }
}

function App() {
  const {
    connection, game, membership, busy, lobbies, maps, mapsLoaded, listError,
    createLobby, joinLobby, startLobby, leaveMembership, refreshLobbies, retrySync, selectRobot,
  } = useMembershipConnection()

  useEffect(() => {
    if (connection.status === 'unauthenticated') window.location.href = '/auth/login'
  }, [connection.status])

  const logout = () => { window.location.href = '/auth/logout' }
  const openSettings = () => { window.location.href = '/auth/settings' }

  // Keep the existing game visible while membership.get restores membership after reconnecting.
  if ((membership.status === 'joined' || membership.status === 'resyncing') && membership.user && game.state.assignment) {
    return <ActiveGame game={game} username={membership.user.username} leaving={busy} onLeave={leaveMembership} onLogout={logout} onSettings={openSettings} />
  }

  if (connection.status === 'unauthenticated') {
    return <EntryScreen><p>Redirecting to login…</p></EntryScreen>
  }

  const browsing = membership.status === 'browsing' || membership.status === 'joining'
  const errorCode = ('error' in membership && membership.error) || (browsing && listError)
  const error = errorCode ? errorMessage(errorCode) : connection.error
  let content: ReactNode
  if (membership.status === 'browsing' || membership.status === 'joining') {
    content = <LobbyScreen
      username={membership.user.username} error={error} lobbies={lobbies} maps={maps} mapsLoaded={mapsLoaded}
      pending={busy || membership.status === 'joining'} connected={connection.status === 'connected'}
      onCreate={createLobby} onJoin={joinLobby} onRefresh={refreshLobbies}
    />
  } else if (membership.status === 'waiting') {
    content = <WaitingLobby
      lobby={membership.lobby} userId={membership.user.userId} disabled={busy || connection.status !== 'connected'}
      onStart={startLobby} onLeave={leaveMembership}
    />
  } else {
    content = <>
      <p>Restoring session…</p>
      <button className="entry-secondary-button" type="button" disabled={busy || connection.status === 'connecting'} onClick={retrySync}>Retry</button>
    </>
  }
  return (
    <EntryScreen
      onLogout={connection.status === 'connected' || membership.user ? logout : undefined}
      onSettings={openSettings}
      aside={membership.status === 'waiting' ? (
        <>
          <LobbyMapPanel lobby={membership.lobby} />
          <aside className="entry-panel" aria-label="Your robot">
            <RobotPicker
              robots={membership.lobby.robots}
              selectedRobotId={membership.lobby.players.find((player) => player.userId === membership.user.userId)?.robotSpriteId
                ?? membership.lobby.robots[0]?.id
                ?? ''}
              selectedColorIndex={membership.lobby.players.find((player) => player.userId === membership.user.userId)?.colorIndex}
              takenColorIndices={membership.lobby.players
                .filter((player) => player.userId !== membership.user.userId)
                .map((player) => player.colorIndex)
                .filter((index): index is number => index !== undefined)}
              colorPalette={membership.lobby.colorPalette}
              disabled={busy || connection.status !== 'connected'}
              onSelect={selectRobot}
            />
          </aside>
        </>
      ) : undefined}
    >
      {error && (membership.status === 'waiting' || membership.status === 'resyncing' || membership.status === 'sync-failed') &&
        <p role="alert" className="entry-validation entry-validation--error">{error}</p>}
      {content}
    </EntryScreen>
  )
}
export default App
