import { randomUUID } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'game_session'

export type Session = Readonly<{ sub: string }>

export type SessionStore = Readonly<{
  create(sub: string, expiresInSeconds: number): string
  get(sessionId: string): Session | undefined
  destroy(sessionId: string): void
}>

export function createSessionStore(): SessionStore {
  const sessions = new Map<string, { sub: string; expiresAt: number }>()

  return {
    create(sub, expiresInSeconds) {
      const sessionId = randomUUID()
      sessions.set(sessionId, { sub, expiresAt: Date.now() + expiresInSeconds * 1000 })
      return sessionId
    },
    get(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) return undefined
      if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId)
        return undefined
      }
      return { sub: session.sub }
    },
    destroy(sessionId) {
      sessions.delete(sessionId)
    },
  }
}
