import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionStore } from '@/auth/sessionStore.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSessionStore', () => {
  it('retrieves the session that was created', () => {
    const store = createSessionStore()
    const sessionId = store.create('user-123', 3600)

    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123' })
  })

  it('returns undefined for an unknown session id', () => {
    const store = createSessionStore()

    expect(store.get('does-not-exist')).toBeUndefined()
  })

  it('keeps independent sessions isolated from each other', () => {
    const store = createSessionStore()
    const first = store.create('user-1', 3600)
    const second = store.create('user-2', 3600)

    expect(store.get(first)).toStrictEqual({ sub: 'user-1' })
    expect(store.get(second)).toStrictEqual({ sub: 'user-2' })
  })

  it('expires a session once its lifetime has passed', () => {
    const store = createSessionStore()
    const sessionId = store.create('user-123', 60)

    vi.advanceTimersByTime(59_000)
    expect(store.get(sessionId)).toStrictEqual({ sub: 'user-123' })

    vi.advanceTimersByTime(2_000)
    expect(store.get(sessionId)).toBeUndefined()
  })

  it('destroy removes a session immediately, even before it would expire', () => {
    const store = createSessionStore()
    const sessionId = store.create('user-123', 3600)

    store.destroy(sessionId)

    expect(store.get(sessionId)).toBeUndefined()
  })

  it('destroying an unknown session id is a no-op', () => {
    const store = createSessionStore()

    expect(() => store.destroy('does-not-exist')).not.toThrow()
  })
})
