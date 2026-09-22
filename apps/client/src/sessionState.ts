import type {
  Card,
  JoinResult,
  LoginResult,
  PlayerAssignment,
  PublicGameState,
  User,
} from '@robo-rally/game-events'

type LoginFailure = Exclude<LoginResult, { outcome: 'LOGGED_IN' }>['outcome']
type JoinFailure = Exclude<JoinResult, { outcome: 'JOINED' }>['outcome']
export type LoginError = LoginFailure | 'LOGIN_REQUIRED' | 'TIMEOUT'

export type SessionState =
  | { status: 'editing'; username: string; error: LoginError | null }
  | { status: 'logging-in'; username: string }
  | { status: 'joining'; user: User }
  | { status: 'join-failed'; user: User; error: Exclude<JoinFailure, 'LOGIN_REQUIRED'> }
  | {
      status: 'joined'
      user: User
      assignment: PlayerAssignment
      state: PublicGameState
      hand: readonly Card[]
      programSubmitted: boolean
    }

export type SessionEvent =
  | { type: 'username-changed'; username: string }
  | { type: 'login-submitted' }
  | { type: 'login-result'; result: LoginResult }
  | { type: 'login-timeout' }
  | { type: 'join-retried' }
  | { type: 'join-result'; result: JoinResult }

export function createSessionState(): SessionState {
  return { status: 'editing', username: '', error: null }
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'username-changed':
      return state.status === 'editing'
        ? { status: 'editing', username: event.username, error: null }
        : state
    case 'login-submitted':
      return state.status === 'editing'
        ? { status: 'logging-in', username: state.username }
        : state
    case 'login-result':
      if (state.status !== 'logging-in') return state
      return event.result.outcome === 'LOGGED_IN'
        ? { status: 'joining', user: event.result.user }
        : { status: 'editing', username: state.username, error: event.result.outcome }
    case 'login-timeout':
      return state.status === 'logging-in'
        ? { status: 'editing', username: state.username, error: 'TIMEOUT' }
        : state
    case 'join-retried':
      return state.status === 'join-failed'
        ? { status: 'joining', user: state.user }
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
        assignment: event.result.assignment,
        state: event.result.state,
        hand: event.result.hand,
        programSubmitted: event.result.programSubmitted,
      }
  }
}
