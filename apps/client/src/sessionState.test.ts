import type { JoinResult, User } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { createSessionState, sessionReducer, type SessionState } from './sessionState.ts'

const user: User = {
  userId: '00000000-0000-4000-8000-000000000001',
  username: ' Player ',
}

const joined: Extract<JoinResult, { outcome: 'JOINED' }> = {
  outcome: 'JOINED',
  assignment: {
    gameId: '00000000-0000-4000-8000-000000000002',
    playerId: '00000000-0000-4000-8000-000000000003',
    robotId: '00000000-0000-4000-8000-000000000004',
  },
  state: {
    gameId: '00000000-0000-4000-8000-000000000002',
    board: { width: 1, height: 1, tiles: [] },
    robots: [],
    phase: 'PROGRAMMING',
  },
  hand: [],
  programSubmitted: false,
}

function joiningState(): SessionState {
  let state = sessionReducer(createSessionState(), {
    type: 'username-changed',
    username: user.username,
  })
  state = sessionReducer(state, { type: 'login-submitted' })
  return sessionReducer(state, { type: 'login-result', result: { outcome: 'LOGGED_IN', user } })
}

describe('sessionReducer', () => {
  it('moves from editing through login and join while preserving separate identities', () => {
    const joining = joiningState()
    const state = sessionReducer(joining, { type: 'join-result', result: joined })

    expect(state).toMatchObject({
      status: 'joined',
      user,
      assignment: joined.assignment,
    })
  })

  it('returns a rejected login to editing with the exact username', () => {
    let state = sessionReducer(createSessionState(), { type: 'username-changed', username: '  ' })
    state = sessionReducer(state, { type: 'login-submitted' })
    state = sessionReducer(state, {
      type: 'login-result',
      result: { outcome: 'INVALID_USERNAME' },
    })

    expect(state).toEqual({ status: 'editing', username: '  ', error: 'INVALID_USERNAME' })
  })

  it('retries a failed join without returning to login', () => {
    let state = sessionReducer(joiningState(), {
      type: 'join-result',
      result: { outcome: 'GAME_NOT_FOUND' },
    })
    state = sessionReducer(state, { type: 'join-retried' })

    expect(state).toEqual({ status: 'joining', user })
  })

  it('returns to login when joining requires it', () => {
    const state = sessionReducer(joiningState(), {
      type: 'join-result',
      result: { outcome: 'LOGIN_REQUIRED' },
    })

    expect(state).toEqual({ status: 'editing', username: user.username, error: 'LOGIN_REQUIRED' })
  })

  it('ignores duplicate submissions and results outside their pending state', () => {
    const loggingIn = sessionReducer(createSessionState(), { type: 'login-submitted' })
    expect(sessionReducer(loggingIn, { type: 'login-submitted' })).toBe(loggingIn)

    const joining = joiningState()
    expect(sessionReducer(joining, {
      type: 'login-result',
      result: { outcome: 'LOGGED_IN', user },
    })).toBe(joining)
    expect(sessionReducer(joining, { type: 'join-retried' })).toBe(joining)
  })
})
