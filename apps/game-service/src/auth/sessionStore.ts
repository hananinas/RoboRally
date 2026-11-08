import { randomUUID } from 'node:crypto'
import type { OidcClient } from '@/infra/oidcClient'

export const SESSION_COOKIE_NAME = 'game_session'

const DEFAULT_SESSION_EXPIRES_IN_SECONDS = 900

export type Session = Readonly<{ sub: string; username: string; idToken: string }>

export type SessionStore = Readonly<{
  create(sub: string, username: string, idToken: string, refreshToken: string, expiresInSeconds: number): string
  get(sessionId: string): Session | undefined
  destroy(sessionId: string): void
}>

export type SessionStoreDeps = Readonly<{
  oidcClient: Pick<OidcClient, 'refreshToken'>
  refreshBufferSeconds: number
}>

type StoredSession = Readonly<{
  sub: string
  username: string
  idToken: string
  refreshToken: string
  expiresAt: number
}>

export function createSessionStore(deps: SessionStoreDeps): SessionStore {
  const sessions = new Map<string, StoredSession>()
  const refreshesInFlight = new Set<string>()

  function startRefresh(sessionId: string, session: StoredSession): void {
    if (refreshesInFlight.has(sessionId)) return
    refreshesInFlight.add(sessionId)

    deps.oidcClient
      .refreshToken(session.refreshToken)
      .then((tokens) => {
        if (!tokens.id_token || !tokens.refresh_token) return
        if (sessions.get(sessionId) !== session) return
        sessions.set(sessionId, {
          sub: session.sub,
          username: session.username,
          idToken: tokens.id_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in ?? DEFAULT_SESSION_EXPIRES_IN_SECONDS) * 1000,
        })
      })
      .catch(() => {
        // Leave the session untouched: the next touch inside the buffer window retries,
        // or it simply reaches hard expiry below and lapses as it always has.
      })
      .finally(() => {
        refreshesInFlight.delete(sessionId)
      })
  }

  return {
    create(sub, username, idToken, refreshToken, expiresInSeconds) {
      const sessionId = randomUUID()
      sessions.set(sessionId, { sub, username, idToken, refreshToken, expiresAt: Date.now() + expiresInSeconds * 1000 })
      return sessionId
    },
    get(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) return undefined
      if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId)
        return undefined
      }
      if (Date.now() > session.expiresAt - deps.refreshBufferSeconds * 1000) {
        startRefresh(sessionId, session)
      }
      return { sub: session.sub, username: session.username, idToken: session.idToken }
    },
    destroy(sessionId) {
      sessions.delete(sessionId)
    },
  }
}
