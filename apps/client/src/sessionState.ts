import type {
  JoinResult,
  LoginResult,
  User,
} from '@robo-rally/game-events'

type LoginFailure = Exclude<LoginResult, { outcome: 'LOGGED_IN' }>['outcome']
type JoinFailure = Exclude<JoinResult, { outcome: 'JOINED' }>['outcome']
export type LoginError = LoginFailure | 'LOGIN_REQUIRED' | 'TIMEOUT'
export type JoinError = Exclude<JoinFailure, 'LOGIN_REQUIRED'>
  | 'CONNECTION_ERROR'
  | 'GAME_ID_MISSING'
  | 'TIMEOUT'

export type SessionState =
  | { status: 'editing'; username: string; error: LoginError | null }
  | { status: 'logging-in'; username: string }
  | { status: 'ready-to-join'; user: User }
  | { status: 'joining'; user: User }
  | { status: 'join-failed'; user: User; error: JoinError | null }
  | {
      status: 'joined'
      user: User
    }

export type SessionEvent =
  | { type: 'left' }
  | { type: 'disconnected' }
  | { type: 'username-changed'; username: string }
  | { type: 'login-submitted' }
  | { type: 'login-result'; result: LoginResult }
  | { type: 'login-timeout' }
  | { type: 'join-requested' }
  | { type: 'join-result'; result: JoinResult }
  | { type: 'join-error'; error: JoinError }

export function createSessionState(): SessionState {
  return { status: 'editing', username: '', error: null }
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'left':
      return state.status === 'joined'
        ? { status: 'ready-to-join', user: state.user }
        : state
    case 'disconnected':
      // Keep the entered game visible; its connection state locks interaction.
      if (state.status === 'joined') return state
      return {
        status: 'editing',
        username: state.status === 'editing' || state.status === 'logging-in'
          ? state.username
          : state.user.username,
        error: null,
      }
    case 'username-changed':
      return state.status === 'editing'
        ? {
            status: 'editing', username: event.username,
            // Editing the name does not clear the identity bound to this connection.
            error: state.error === 'ALREADY_LOGGED_IN' ? state.error : null,
          }
        : state
    case 'login-submitted':
      return state.status === 'editing'
        ? { status: 'logging-in', username: state.username }
        : state
    case 'login-result':
      if (state.status !== 'logging-in') return state
      return event.result.outcome === 'LOGGED_IN'
        ? { status: 'ready-to-join', user: event.result.user }
        : { status: 'editing', username: state.username, error: event.result.outcome }
    case 'login-timeout':
      return state.status === 'logging-in'
        ? { status: 'editing', username: state.username, error: 'TIMEOUT' }
        : state
    case 'join-requested':
      return state.status === 'ready-to-join' || state.status === 'join-failed'
        ? { status: 'joining', user: state.user }
        : state
    case 'join-error':
      return state.status === 'joining'
        ? { status: 'join-failed', user: state.user, error: event.error }
        : state
    case 'join-result':
      if (state.status !== 'joining') return state
      if (event.result.outcome === 'LOGIN_REQUIRED') {
        return { status: 'editing', username: state.user.username, error: 'LOGIN_REQUIRED' }
      }
      if (event.result.outcome !== 'JOINED') {
        return { status: 'join-failed', user: state.user, error: event.result.outcome }
      }
      return {
        status: 'joined',
        user: state.user,
      }
  }
}
