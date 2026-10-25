import type {
  GameId,
  JoinResult,
  LoginResult,
  User,
} from '@robo-rally/game-events'

type LoginFailure = Exclude<LoginResult, { outcome: 'LOGGED_IN' }>['outcome']
type JoinFailure = Exclude<JoinResult, { outcome: 'JOINED' }>['outcome']
export type LoginError = LoginFailure | 'LOGIN_REQUIRED' | 'TIMEOUT'
export type JoinError = Exclude<JoinFailure, 'LOGIN_REQUIRED'>
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'

export type SessionState =
  | { status: 'editing'; username: string; error: LoginError | null }
  | { status: 'logging-in'; username: string }
  | { status: 'ready-to-join'; user: User }
  | { status: 'joining'; user: User; gameId: GameId }
  | { status: 'join-failed'; user: User; error: JoinError | null }
  | { status: 'resyncing'; user: User; gameId: GameId }
  | { status: 'joined'; user: User; gameId: GameId }

export type SessionEvent =
  | { type: 'left' }
  | { type: 'disconnected' }
  | { type: 'resync' }
  | { type: 'username-changed'; username: string }
  | { type: 'login-submitted' }
  | { type: 'login-result'; result: LoginResult }
  | { type: 'login-timeout' }
  | { type: 'join-requested'; gameId: GameId }
  | { type: 'join-result'; result: JoinResult }
  | { type: 'join-error'; error: JoinError }

export function createSessionState(): SessionState {
  return { status: 'editing', username: '', error: null }
}

type AwaitingLogin = Extract<SessionState, { status: 'logging-in' | 'resyncing' }>

function isAwaitingLogin(state: SessionState): state is AwaitingLogin {
  return state.status === 'logging-in' || state.status === 'resyncing'
}

function usernameOf(state: AwaitingLogin): string {
  return state.status === 'logging-in' ? state.username : state.user.username
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
    case 'resync':
      return state.status === 'joined'
       ? { status: 'resyncing', user: state.user, gameId: state.gameId }
        : state
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
    case 'login-result': {
      if (!isAwaitingLogin(state)) return state
      const username = usernameOf(state)
      if (event.result.outcome !== 'LOGGED_IN') {
        return { status: 'editing', username, error: event.result.outcome }
      }
      return state.status === 'resyncing'
        ? { status: 'joining', user: event.result.user, gameId: state.gameId }
        : { status: 'ready-to-join', user: event.result.user }
    }
    case 'login-timeout':
      return isAwaitingLogin(state)
        ? { status: 'editing', username: usernameOf(state), error: 'TIMEOUT' }
        : state
    case 'join-requested':
      return state.status === 'ready-to-join' || state.status === 'join-failed'
        ? { status: 'joining', user: state.user, gameId: event.gameId }
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
        gameId:state.gameId
      }
  }
}
