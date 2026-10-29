import express, { type ErrorRequestHandler, type Express } from 'express'
import { parseCookie, stringifySetCookie } from 'cookie'
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client'
import type { OidcClient } from '@/infra/oidcClient'
import { SESSION_COOKIE_NAME, type SessionStore } from '@/auth/sessionStore'
import { logError, logInfo, logWarn } from '@/logger'

const TRANSACTION_COOKIE_PATH = '/auth/callback'
const TRANSACTION_COOKIE_MAX_AGE_SECONDS = 300
const STATE_COOKIE_NAME = 'oauth_state'
const VERIFIER_COOKIE_NAME = 'oauth_verifier'

const DEFAULT_SESSION_EXPIRES_IN_SECONDS = 900

export type AuthAppDeps = Readonly<{ oidcClient: OidcClient; sessionStore: SessionStore }>

export function createAuthApp({ oidcClient, sessionStore }: AuthAppDeps): Express {
  const app = express()

  app.get('/auth/login', async (req, res) => {
    const codeVerifier = randomPKCECodeVerifier()
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)
    const state = randomState()

    const authorizationUrl = await oidcClient.buildAuthorizationUrl({
      scope: 'openid',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
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
    const state = cookies[STATE_COOKIE_NAME]
    const codeVerifier = cookies[VERIFIER_COOKIE_NAME]

    if (!state || !codeVerifier) {
      logWarn('Rejected OIDC callback: missing or expired transaction cookies', { url: req.originalUrl })
      res.setHeader('Set-Cookie', clearTransactionCookies)
      res.status(400).type('text/plain').send('Login session expired or missing. Please try /auth/login again.')
      return
    }

    try {
      const tokens = await oidcClient.exchangeAuthorizationCode(req.originalUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
      })
      const sub = tokens.claims()?.sub
      if (!sub) {
        throw new Error('ID token did not contain a subject claim')
      }
      if (!tokens.id_token) {
        throw new Error('Token response did not contain an ID token')
      }

      const expiresIn = tokens.expires_in ?? DEFAULT_SESSION_EXPIRES_IN_SECONDS
      const sessionId = sessionStore.create(sub, tokens.id_token, expiresIn)
      logInfo('OIDC callback succeeded', { sub })

      res.setHeader('Set-Cookie', [
        ...clearTransactionCookies,
        sessionCookie(sessionId, expiresIn),
      ])
      res.redirect('/')
    } catch (error) {
      logError('OIDC callback failed', error, { url: req.originalUrl })
      res.setHeader('Set-Cookie', clearTransactionCookies)
      res.status(400).type('text/plain').send('Login failed. Please try /auth/login again.')
    }
  })

  app.get('/auth/logout', async (req, res) => {
    const cookies = parseCookie(req.headers.cookie ?? '')
    const sessionId = cookies[SESSION_COOKIE_NAME]
    const session = sessionId ? sessionStore.get(sessionId) : undefined
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

  app.use(handleAuthRouteError)

  return app
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
