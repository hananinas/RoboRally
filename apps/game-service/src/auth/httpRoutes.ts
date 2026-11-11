import express, { type ErrorRequestHandler, type Express, type Request } from 'express'
import { parseCookie, stringifySetCookie } from 'cookie'
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client'
import { err, ok, type Result } from 'neverthrow'
import type { OidcClient } from '@/infra/oidcClient'
import { SESSION_COOKIE_NAME, type Session, type SessionStore } from '@/auth/sessionStore'
import { logError, logInfo, logWarn } from '@/logger'

const TRANSACTION_COOKIE_PATH = '/auth/callback'
const TRANSACTION_COOKIE_MAX_AGE_SECONDS = 300
const STATE_COOKIE_NAME = 'oauth_state'
const VERIFIER_COOKIE_NAME = 'oauth_verifier'

const DEFAULT_SESSION_EXPIRES_IN_SECONDS = 900

export type AuthAppDeps = Readonly<{
  oidcClient: OidcClient
  sessionStore: SessionStore
  kratosSettingsUrl: URL
  refreshTokenTtlSeconds: number
}>

export function createAuthApp({ oidcClient, sessionStore, kratosSettingsUrl, refreshTokenTtlSeconds }: AuthAppDeps): Express {
  const app = express()

  app.get('/auth/login', async (req, res) => {
    const { session } = readSession(req, sessionStore)
    if (session) {
      res.redirect('/')
      return
    }

    const codeVerifier = randomPKCECodeVerifier()
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)
    const state = randomState()

    const authorizationUrl = await oidcClient.buildAuthorizationUrl({
      scope: 'openid profile offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      prompt: 'login',
    })

    res.setHeader('Set-Cookie', [
      transactionCookie(STATE_COOKIE_NAME, state, TRANSACTION_COOKIE_MAX_AGE_SECONDS),
      transactionCookie(VERIFIER_COOKIE_NAME, codeVerifier, TRANSACTION_COOKIE_MAX_AGE_SECONDS),
    ])
    res.redirect(authorizationUrl.toString())
  })

  app.get('/auth/callback', async (req, res) => {
    const clearTransactionCookies = [
      transactionCookie(STATE_COOKIE_NAME, '', 0),
      transactionCookie(VERIFIER_COOKIE_NAME, '', 0),
    ]

    const cookies = parseCookie(req.headers.cookie ?? '')
    const result = await exchangeCallback(oidcClient, req, cookies)

    if (result.isErr()) {
      res.setHeader('Set-Cookie', clearTransactionCookies)
      if (result.error === 'MISSING_TRANSACTION_COOKIES') {
        logWarn('Rejected OIDC callback: missing or expired transaction cookies', { url: req.originalUrl })
        res.status(400).type('text/plain').send('Login session expired or missing. Please try /auth/login again.')
      } else {
        logError('OIDC callback failed', new Error(result.error), { url: req.originalUrl })
        res.status(400).type('text/plain').send('Login failed. Please try /auth/login again.')
      }
      return
    }

    const { sub, username, idToken, refreshToken, expiresIn } = result.value
    const sessionId = sessionStore.create(sub, username, idToken, refreshToken, expiresIn)
    logInfo('OIDC callback succeeded', { sub })

    res.setHeader('Set-Cookie', [
      ...clearTransactionCookies,
      sessionCookie(sessionId, refreshTokenTtlSeconds),
    ])
    res.redirect('/')
  })

  app.get('/auth/logout', async (req, res) => {
    const { sessionId, session } = readSession(req, sessionStore)
    if (sessionId) {
      sessionStore.destroy(sessionId)
    }

    res.setHeader('Set-Cookie', sessionCookie('', 0))

    if (!session) {
      res.redirect(oidcClient.postLogoutRedirectUrl.toString())
      return
    }

    const endSessionUrl = await oidcClient.buildEndSessionUrl(session.idToken)
    res.redirect(endSessionUrl.toString())
  })

  app.get('/auth/settings', (req, res) => {
    const { session } = readSession(req, sessionStore)

    if (!session) {
      res.redirect('/auth/login')
      return
    }

    const settingsUrl = new URL(kratosSettingsUrl)
    settingsUrl.searchParams.set('return_to', oidcClient.postLogoutRedirectUrl.toString())
    res.redirect(settingsUrl.toString())
  })

  app.use(handleAuthRouteError)

  return app
}

type CallbackError =
  | 'MISSING_TRANSACTION_COOKIES'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'MISSING_SUBJECT_CLAIM'
  | 'MISSING_USERNAME_CLAIM'
  | 'MISSING_ID_TOKEN'
  | 'MISSING_REFRESH_TOKEN'

type CallbackSession = Readonly<{
  sub: string
  username: string
  idToken: string
  refreshToken: string
  expiresIn: number
}>

async function exchangeCallback(
  oidcClient: OidcClient,
  req: Request,
  cookies: Record<string, string | undefined>,
): Promise<Result<CallbackSession, CallbackError>> {
  const state = cookies[STATE_COOKIE_NAME]
  const codeVerifier = cookies[VERIFIER_COOKIE_NAME]
  if (!state || !codeVerifier) return err('MISSING_TRANSACTION_COOKIES')

  let tokens
  try {
    tokens = await oidcClient.exchangeAuthorizationCode(req.originalUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    })
  } catch {
    return err('TOKEN_EXCHANGE_FAILED')
  }

  const claims = tokens.claims()
  const sub = claims?.sub
  if (!sub) return err('MISSING_SUBJECT_CLAIM')

  const username = claims?.preferred_username
  if (typeof username !== 'string' || username.length === 0) return err('MISSING_USERNAME_CLAIM')

  if (!tokens.id_token) return err('MISSING_ID_TOKEN')
  if (!tokens.refresh_token) return err('MISSING_REFRESH_TOKEN')

  return ok({
    sub,
    username,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in ?? DEFAULT_SESSION_EXPIRES_IN_SECONDS,
  })
}

function readSession(
  req: Request,
  sessionStore: SessionStore,
): { sessionId: string | undefined; session: Session | undefined } {
  const cookies = parseCookie(req.headers.cookie ?? '')
  const sessionId = cookies[SESSION_COOKIE_NAME]
  return { sessionId, session: sessionId ? sessionStore.get(sessionId) : undefined }
}

function cookie(name: string, value: string, path: string, maxAge: number): string {
  return stringifySetCookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path,
    maxAge,
  })
}

function transactionCookie(name: string, value: string, maxAge: number): string {
  return cookie(name, value, TRANSACTION_COOKIE_PATH, maxAge)
}

function sessionCookie(value: string, maxAge: number): string {
  return cookie(SESSION_COOKIE_NAME, value, '/', maxAge)
}

const handleAuthRouteError: ErrorRequestHandler = (err, req, res, _next) => {
  logError('Unhandled error in auth route', err, { url: req.url })
  res.status(500).type('text/plain').send('Internal error')
}
