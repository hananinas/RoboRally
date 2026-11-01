import type { SessionStore } from '@/auth/sessionStore'

export function authCookieHeader(sessionStore: SessionStore, sub = 'test-subject', username = 'Bence'): Record<string, string> {
  const sessionId = sessionStore.create(sub, username, 'test-id-token', 3600)
  return { Cookie: `game_session=${sessionId}` }
}
