import type { GameInitialization, User } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { sessionReducer, type SessionState } from './sessionState.ts'

const user: User = {
  userId: '00000000-0000-4000-8000-000000000001',
  username: ' Player ',
}

const joined: GameInitialization = {
  outcome: 'JOINED',
  assignment: {
    gameId: '00000000-0000-4000-8000-000000000002',
    playerId: '00000000-0000-4000-8000-000000000003',
    robotId: '00000000-0000-4000-8000-000000000004',
  },
  state: {
    gameId: '00000000-0000-4000-8000-000000000002',
    serverTime: 0,
    programmingTimer: { status: 'IDLE' },
    antenna: { x: 0, y: 0, angle: Math.PI / 2 },
    board: { width: 1, height: 1, tiles: [] },
    robots: [],
    players: [],
    phase: 'PROGRAMMING',
    paused: false,
    aborted: false,
    checkpointCount: 0,
    winner: null,
  },
  hand: [],
  program: [null, null, null, null, null],
  programSubmitted: false,
}

const lobby = { lobbyId: 'lobby-1', name: 'Lobby One', ownerUserId: user.userId, playerCount: 1, maxPlayers: 6, players: [user] }
const browsing: SessionState = { status: 'browsing', user, error: null }
const waiting: SessionState = { status: 'waiting', user, lobby, error: null }

describe('lobby session transitions', () => {
  it('discovers a session on first connect before offering lobby actions', () => {
    const syncing = sessionReducer({ status: 'resyncing', user: null }, { type: 'sync-requested' })
    expect(syncing.status).toBe('resyncing')
    expect(sessionReducer(syncing, { type: 'session-result', result: { outcome: 'NO_SESSION', user } })).toEqual(browsing)
  })
  it('waits after creating or joining without entering gameplay', () => {
    const joining = sessionReducer(browsing, { type: 'lobby-requested', lobbyId: lobby.lobbyId })
    expect(sessionReducer(joining, { type: 'lobby-result', result: { outcome: 'LOBBY_JOINED', lobby } })).toEqual(waiting)
  })
  it('accepts start during a pending join, ignores duplicate starts and late lobby replies', () => {
    const joining = sessionReducer(browsing, { type: 'lobby-requested', lobbyId: lobby.lobbyId })
    const event = { type: 'game-started', lobbyId: lobby.lobbyId, initialization: joined } as const
    const playing = sessionReducer(joining, event)
    expect(playing.status).toBe('joined')
    expect(sessionReducer(playing, event)).toBe(playing)
    expect(sessionReducer(playing, { type: 'lobby-result', result: { outcome: 'LOBBY_JOINED', lobby } })).toBe(playing)
    expect(sessionReducer(playing, { type: 'lobby-updated', lobby })).toBe(playing)
  })
  it('ignores starts and updates for other lobbies', () => {
    expect(sessionReducer(waiting, { type: 'game-started', lobbyId: 'other', initialization: joined })).toBe(waiting)
    expect(sessionReducer(waiting, { type: 'lobby-updated', lobby: { ...lobby, lobbyId: 'other' } })).toBe(waiting)
  })
  it('applies ownership changes without leaving the waiting screen', () => {
    const next = sessionReducer(waiting, { type: 'lobby-updated', lobby: { ...lobby, ownerUserId: 'other' } })
    expect(next).toMatchObject({ status: 'waiting', lobby: { ownerUserId: 'other' } })
  })
  it('reconciles ambiguous commands to either lobby, game, or browsing', () => {
    const syncing = sessionReducer(waiting, { type: 'sync-requested' })
    expect(sessionReducer(syncing, { type: 'session-result', result: { outcome: 'IN_LOBBY', lobby, user } })).toEqual(waiting)
    expect(sessionReducer(syncing, { type: 'session-result', result: { outcome: 'IN_GAME', initialization: joined, user } })).toMatchObject({ status: 'joined', gameId: joined.assignment.gameId })
    expect(sessionReducer(syncing, { type: 'session-result', result: { outcome: 'NO_SESSION', user } })).toEqual(browsing)
  })
  it('retains identity when leaving and stops automatic reconciliation on error', () => {
    expect(sessionReducer(waiting, { type: 'left' })).toEqual(browsing)
    const syncing = sessionReducer(waiting, { type: 'disconnected' })
    expect(sessionReducer(syncing, { type: 'error', error: 'TIMEOUT' })).toMatchObject({ status: 'sync-failed', user })
  })
  it('returns failed joins to browsing with a useful error', () => {
    const joining = sessionReducer(browsing, { type: 'lobby-requested', lobbyId: lobby.lobbyId })
    expect(sessionReducer(joining, { type: 'lobby-result', result: { outcome: 'LOBBY_FULL' } })).toMatchObject({ status: 'browsing', error: 'LOBBY_FULL' })
  })
  it('resyncs from scratch on first connect, with no identity known yet', () => {
    const syncing = sessionReducer({ status: 'resyncing', user: null }, { type: 'sync-requested' })
    expect(syncing).toEqual({ status: 'resyncing', user: null })
    expect(sessionReducer(syncing, { type: 'error', error: 'TIMEOUT' })).toEqual({ status: 'sync-failed', user: null, error: 'TIMEOUT' })
  })
  it('keeps joined state across a recovered reconnect but resyncs after a real disconnect', () => {
    const joinedState: SessionState = { status: 'joined', user, gameId: joined.assignment.gameId }
    expect(sessionReducer(joinedState, { type: 'disconnected' })).toBe(joinedState)
    expect(sessionReducer(joinedState, { type: 'sync-requested' })).toEqual({ status: 'resyncing', user })
  })

})
