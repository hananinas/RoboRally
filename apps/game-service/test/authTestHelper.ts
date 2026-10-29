import type { SessionStore } from '@/auth/sessionStore'

export function authCookieHeader(sessionStore: SessionStore, sub = 'test-subject'): Record<string, string> {
  const sessionId = sessionStore.create(sub, 'test-id-token', 3600)
  return { Cookie: `game_session=${sessionId}` }
}
