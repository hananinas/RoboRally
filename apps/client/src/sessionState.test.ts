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
    players: [],
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
  const editing: SessionState = { status: 'editing', username: user.username, error: null }
  it.each([
    editing,
    sessionReducer(editing, { type: 'login-submitted' }),
    joiningState(),
    sessionReducer(joiningState(), { type: 'join-error', error: 'TIMEOUT' }),
  ])('requires fresh login after disconnect from $status', (previous) => {
    const reset = sessionReducer(previous, { type: 'disconnected' })
    expect(reset).toEqual(editing)
    expect(sessionReducer(reset, { type: 'join-retried' })).toBe(reset)
    expect(sessionReducer(reset, { type: 'join-result', result: joined })).toBe(reset)
    expect(sessionReducer(reset, {
      type: 'login-result', result: { outcome: 'LOGGED_IN', user },
    })).toBe(reset)
    expect(sessionReducer(reset, { type: 'login-submitted' })).toEqual({
      status: 'logging-in', username: user.username,
    })
  })

  it('keeps the entered game visible after disconnect without restarting login or join', () => {
    const entered = sessionReducer(joiningState(), { type: 'join-result', result: joined })
    const disconnected = sessionReducer(entered, { type: 'disconnected' })
    expect(disconnected).toBe(entered)
    expect(sessionReducer(disconnected, { type: 'login-submitted' })).toBe(disconnected)
    expect(sessionReducer(disconnected, { type: 'join-retried' })).toBe(disconnected)
  })

  it('moves from editing through login and join while retaining the approved user', () => {
    const joining = joiningState()
    const state = sessionReducer(joining, { type: 'join-result', result: joined })

    expect(state).toMatchObject({
      status: 'joined',
      user,
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

  it('allows retry after a login timeout', () => {
    let state = sessionReducer(createSessionState(), { type: 'username-changed', username: 'Player' })
    state = sessionReducer(state, { type: 'login-submitted' })
    state = sessionReducer(state, { type: 'login-timeout' })

    expect(state).toEqual({ status: 'editing', username: 'Player', error: 'TIMEOUT' })
  })

  it('retains the need to reconnect after an identity conflict, even when editing the name', () => {
    let state = sessionReducer(editing, { type: 'login-submitted' })
    state = sessionReducer(state, { type: 'login-result', result: { outcome: 'ALREADY_LOGGED_IN' } })
    state = sessionReducer(state, { type: 'username-changed', username: ' New player ' })
    expect(state).toEqual({ status: 'editing', username: ' New player ', error: 'ALREADY_LOGGED_IN' })
    expect(sessionReducer(state, { type: 'disconnected' })).toEqual({
      status: 'editing', username: ' New player ', error: null,
    })
  })

  it.each(['GAME_NOT_FOUND', 'GAME_ALREADY_STARTED'] as const)('retries %s without returning to login', (outcome) => {
    let state = sessionReducer(joiningState(), {
      type: 'join-result',
      result: { outcome },
    })
    expect(state).toEqual({ status: 'join-failed', user, error: outcome })
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


  it('keeps login identity available after a join timeout', () => {
    const state = sessionReducer(joiningState(), {
      type: 'join-error',
      error: 'TIMEOUT',
    })

    expect(state).toEqual({ status: 'join-failed', user, error: 'TIMEOUT' })
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
