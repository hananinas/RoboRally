import { randomUUID } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'game_session'

export type Session = Readonly<{ sub: string; idToken: string }>

export type SessionStore = Readonly<{
  create(sub: string, idToken: string, expiresInSeconds: number): string
  get(sessionId: string): Session | undefined
  destroy(sessionId: string): void
}>

export function createSessionStore(): SessionStore {
  const sessions = new Map<string, { sub: string; idToken: string; expiresAt: number }>()

  return {
    create(sub, idToken, expiresInSeconds) {
      const sessionId = randomUUID()
      sessions.set(sessionId, { sub, idToken, expiresAt: Date.now() + expiresInSeconds * 1000 })
      return sessionId
    },
    get(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) return undefined
      if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId)
        return undefined
      }
      return { sub: session.sub, idToken: session.idToken }
    },
    destroy(sessionId) {
      sessions.delete(sessionId)
    },
  }
}
