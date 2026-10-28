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

      const expiresIn = tokens.expires_in ?? DEFAULT_SESSION_EXPIRES_IN_SECONDS
      const sessionId = sessionStore.create(sub, expiresIn)
      logInfo('OIDC callback succeeded', { sub })

      res.setHeader('Set-Cookie', [
        ...clearTransactionCookies,
        stringifySetCookie(SESSION_COOKIE_NAME, sessionId, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: expiresIn,
        }),
      ])
      res.status(200).type('text/plain').send(`Login succeeded. Subject: ${sub}`)
    } catch (error) {
      logError('OIDC callback failed', error, { url: req.originalUrl })
      res.setHeader('Set-Cookie', clearTransactionCookies)
      res.status(400).type('text/plain').send('Login failed. Please try /auth/login again.')
    }
  })

  app.use(handleAuthRouteError)

  return app
}

function transactionCookie(name: string, value: string, maxAge: number): string {
  return stringifySetCookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: TRANSACTION_COOKIE_PATH,
    maxAge,
  })
}

const handleAuthRouteError: ErrorRequestHandler = (err, req, res, _next) => {
  logError('Unhandled error in auth route', err, { url: req.url })
  res.status(500).type('text/plain').send('Internal error')
}
