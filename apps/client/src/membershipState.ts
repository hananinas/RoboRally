import type { GameInitialization, LobbyJoinResult, LobbyState, MembershipResult, User } from '@robo-rally/game-events'

export type MembershipState =
  | { status: 'resyncing'; user: User | null }
  | { status: 'browsing'; user: User; error: string | null }
  | { status: 'joining'; user: User; lobbyId: string | null }
  | { status: 'waiting'; user: User; lobby: LobbyState; error: string | null }
  | { status: 'joined'; user: User; gameId: string }
  | { status: 'sync-failed'; user: User | null; error: string }

export type MembershipEvent =
  | { type: 'lobby-requested'; lobbyId: string | null }
  | { type: 'lobby-result'; result: LobbyJoinResult }
  | { type: 'lobby-updated'; lobby: LobbyState }
  | { type: 'game-started'; lobbyId: string; initialization: GameInitialization }
  | { type: 'sync-requested' }
  | { type: 'membership-result'; result: MembershipResult }
  | { type: 'error'; error: string }
  | { type: 'left' }
  | { type: 'disconnected' }

export function createMembershipState(): MembershipState {
  return { status: 'resyncing', user: null }
}

export function membershipReducer(state: MembershipState, event: MembershipEvent): MembershipState {
  switch (event.type) {
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
      return { status: 'resyncing', user: state.user }
    case 'membership-result': {
      if (state.status !== 'resyncing') return state
      const result = event.result
      if (result.outcome === 'NO_MEMBERSHIP') return { status: 'browsing', user: result.user, error: null }
      if (result.outcome === 'IN_LOBBY') return { status: 'waiting', user: result.user, lobby: result.lobby, error: null }
      if (result.outcome === 'IN_GAME') return { status: 'joined', user: result.user, gameId: result.initialization.assignment.gameId }
      return { status: 'sync-failed', user: state.user, error: result.outcome }
    }
    case 'error':
      if (state.status === 'resyncing') return { status: 'sync-failed', user: state.user, error: event.error }
      if (state.status === 'waiting' || state.status === 'browsing') return { ...state, error: event.error }
      return state
    case 'left':
      return state.user ? { status: 'browsing', user: state.user, error: null } : state
    case 'disconnected':
      return state.status === 'joined' ? state : { status: 'resyncing', user: state.user }
  }
}
