import type { SessionStore } from '@/auth/sessionStore'

export function authCookieHeader(sessionStore: SessionStore, sub = 'test-subject'): Record<string, string> {
  const sessionId = sessionStore.create(sub, 3600)
  return { Cookie: `game_session=${sessionId}` }
}
