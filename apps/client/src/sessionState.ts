import type { GameInitialization, LobbyJoinResult, LobbyState, LoginResult, SessionResult, User } from '@robo-rally/game-events'

export type SessionState =
  | { status: 'editing'; username: string; error: string | null }
  | { status: 'logging-in'; username: string }
  | { status: 'browsing'; user: User; error: string | null }
  | { status: 'joining'; user: User; lobbyId: string | null }
  | { status: 'waiting'; user: User; lobby: LobbyState; error: string | null }
  | { status: 'joined'; user: User; gameId: string }
  | { status: 'resyncing'; user: User }
  | { status: 'sync-failed'; user: User; error: string }

export type SessionEvent =
  | { type: 'username-changed'; username: string }
  | { type: 'login-submitted' }
  | { type: 'login-result'; result: LoginResult }
  | { type: 'login-error'; error: string }
  | { type: 'lobby-requested'; lobbyId: string | null }
  | { type: 'lobby-result'; result: LobbyJoinResult }
  | { type: 'lobby-updated'; lobby: LobbyState }
  | { type: 'game-started'; lobbyId: string; initialization: GameInitialization }
  | { type: 'sync-requested' }
  | { type: 'session-result'; result: SessionResult }
  | { type: 'error'; error: string }
  | { type: 'left' }
  | { type: 'disconnected' }

export function createSessionState(): SessionState {
  return { status: 'editing', username: '', error: null }
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'username-changed':
      return state.status === 'editing' ? { ...state, username: event.username } : state
    case 'login-submitted':
      return state.status === 'editing' ? { status: 'logging-in', username: state.username } : state
    case 'login-result': {
      if (state.status !== 'logging-in' && state.status !== 'resyncing') return state
      const username = state.status === 'logging-in' ? state.username : state.user.username
      return event.result.outcome === 'LOGGED_IN'
        ? { status: 'resyncing', user: event.result.user }
        : { status: 'editing', username, error: event.result.outcome }
    }
    case 'login-error':
      return state.status === 'logging-in' ? { status: 'editing', username: state.username, error: event.error } : state
    case 'lobby-requested':
      return state.status === 'browsing' ? { status: 'joining', user: state.user, lobbyId: event.lobbyId } : state
    case 'lobby-result':
      if (state.status !== 'joining') return state
      return event.result.outcome === 'LOBBY_JOINED'
        ? { status: 'waiting', user: state.user, lobby: event.result.lobby, error: null }
        : { status: 'browsing', user: state.user, error: event.result.outcome }
    case 'lobby-updated':
      return state.status === 'waiting' && state.lobby.lobbyId === event.lobby.lobbyId
        ? { ...state, lobby: event.lobby } : state
    case 'game-started':
      return (state.status === 'waiting' && state.lobby.lobbyId === event.lobbyId)
        || (state.status === 'joining' && state.lobbyId === event.lobbyId)
        ? { status: 'joined', user: state.user, gameId: event.initialization.assignment.gameId } : state
    case 'sync-requested':
      return 'user' in state ? { status: 'resyncing', user: state.user } : state
    case 'session-result': {
      if (state.status !== 'resyncing') return state
      const result = event.result
      if (result.outcome === 'NO_SESSION') return { status: 'browsing', user: state.user, error: null }
      if (result.outcome === 'IN_LOBBY') return { status: 'waiting', user: state.user, lobby: result.lobby, error: null }
      if (result.outcome === 'IN_GAME') return { status: 'joined', user: state.user, gameId: result.initialization.assignment.gameId }
      if (result.outcome === 'LOGIN_REQUIRED') return { status: 'editing', username: state.user.username, error: result.outcome }
      return { status: 'sync-failed', user: state.user, error: result.outcome }
    }
    case 'error':
      if (state.status === 'resyncing') return { status: 'sync-failed', user: state.user, error: event.error }
      if (state.status === 'waiting' || state.status === 'browsing') return { ...state, error: event.error }
      return state
    case 'left':
      return 'user' in state ? { status: 'browsing', user: state.user, error: null } : state
    case 'disconnected':
      if (state.status === 'joined') return state
      if ('user' in state) return { status: 'resyncing', user: state.user }
      return { status: 'editing', username: state.username, error: null }
  }
}
