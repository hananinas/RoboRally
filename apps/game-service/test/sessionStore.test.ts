import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionStore, type SessionStoreDeps } from '@/auth/sessionStore.ts'

const noRefresh: SessionStoreDeps = {
  oidcClient: { refreshToken: () => Promise.reject(new Error('not used in this test')) },
  refreshBufferSeconds: 0,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSessionStore', () => {
  it('retrieves the session that was created', () => {
    const store = createSessionStore(noRefresh)
    const sessionId = store.create('user-123', 'Bence', 'id-token-123', 'refresh-token-123', 3600)

    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123', username: 'Bence', idToken: 'id-token-123' })
  })

  it('returns undefined for an unknown session id', () => {
    const store = createSessionStore(noRefresh)

    expect(store.get('does-not-exist')).toBeUndefined()
  })

  it('keeps independent sessions isolated from each other', () => {
    const store = createSessionStore(noRefresh)
    const first = store.create('user-1', 'Bence', 'id-token-1', 'refresh-token-1', 3600)
    const second = store.create('user-2', 'Dane', 'id-token-2', 'refresh-token-2', 3600)

    expect(store.get(first)).toStrictEqual({ sub: 'user-1', username: 'Bence', idToken: 'id-token-1' })
    expect(store.get(second)).toStrictEqual({ sub: 'user-2', username: 'Dane', idToken: 'id-token-2' })
  })

  it('expires a session once its lifetime has passed', () => {
    const store = createSessionStore(noRefresh)
    const sessionId = store.create('user-123', 'Bence', 'id-token-123', 'refresh-token-123', 60)

    vi.advanceTimersByTime(59_000)
    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123', username: 'Bence', idToken: 'id-token-123' })

    vi.advanceTimersByTime(2_000)
    expect(store.get(sessionId)).toBeUndefined()
  })

  it('destroy removes a session immediately, even before it would expire', () => {
    const store = createSessionStore(noRefresh)
    const sessionId = store.create('user-123', 'Bence', 'id-token-123', 'refresh-token-123', 3600)

    store.destroy(sessionId)

    expect(store.get(sessionId)).toBeUndefined()
  })

  it('destroying an unknown session id is a no-op', () => {
    const store = createSessionStore(noRefresh)

    expect(() => store.destroy('does-not-exist')).not.toThrow()
  })

  it('refreshes the session in the background once it enters the refresh buffer, without blocking the caller', async () => {
    const refreshToken = vi.fn().mockResolvedValue({
      id_token: 'id-token-new',
      refresh_token: 'refresh-token-new',
      expires_in: 900,
    })
    const store = createSessionStore({ oidcClient: { refreshToken }, refreshBufferSeconds: 60 })
    const sessionId = store.create('user-123', 'Bence', 'id-token-123', 'refresh-token-123', 120)

    vi.advanceTimersByTime(61_000) // 59s left: inside the 60s buffer, not yet hard-expired

    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123', username: 'Bence', idToken: 'id-token-123' })
    expect(refreshToken).toHaveBeenCalledWith('refresh-token-123')

    await vi.advanceTimersByTimeAsync(0) // flush the background refresh promise

    vi.advanceTimersByTime(800_000) // well past the old expiry, within the new token's 900s lifetime
    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123', username: 'Bence', idToken: 'id-token-new' })
  })

  it('does not start a second refresh while one is already in flight for the same session', async () => {
    const refreshToken = vi.fn().mockResolvedValue({
      id_token: 'id-token-new',
      refresh_token: 'refresh-token-new',
      expires_in: 900,
    })
    const store = createSessionStore({ oidcClient: { refreshToken }, refreshBufferSeconds: 60 })
    const sessionId = store.create('user-123', 'Bence', 'id-token-123', 'refresh-token-123', 120)

    vi.advanceTimersByTime(61_000)
    store.get(sessionId)
    store.get(sessionId)
    store.get(sessionId)

    expect(refreshToken).toHaveBeenCalledTimes(1)
  })

  it('leaves the session untouched when the background refresh fails, until it reaches hard expiry', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('invalid_grant'))
    const store = createSessionStore({ oidcClient: { refreshToken }, refreshBufferSeconds: 60 })
    const sessionId = store.create('user-123', 'Bence', 'id-token-123', 'refresh-token-123', 120)

    vi.advanceTimersByTime(61_000)
    store.get(sessionId)
    await vi.advanceTimersByTimeAsync(0)

    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123', username: 'Bence', idToken: 'id-token-123' })

    vi.advanceTimersByTime(60_000) // now past the original 120s hard expiry
    expect(store.get(sessionId)).toBeUndefined()
  })
})
