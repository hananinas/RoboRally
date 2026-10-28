import express, { type ErrorRequestHandler, type Express } from 'express'
import { parseCookie, stringifySetCookie } from 'cookie'
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client'
import type { OidcClient } from '@/infra/oidcClient'
import { logError, logInfo, logWarn } from '@/logger'

const TRANSACTION_COOKIE_PATH = '/auth/callback'
const TRANSACTION_COOKIE_MAX_AGE_SECONDS = 300
const STATE_COOKIE_NAME = 'oauth_state'
const VERIFIER_COOKIE_NAME = 'oauth_verifier'

export type AuthAppDeps = Readonly<{ oidcClient: OidcClient }>

export function createAuthApp({ oidcClient }: AuthAppDeps): Express {
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
      const claims = tokens.claims()
      logInfo('OIDC callback succeeded', { sub: claims?.sub })

      res.setHeader('Set-Cookie', clearTransactionCookies)
      res.status(200).type('text/plain').send(`Login succeeded (temporary, no session yet). Subject: ${claims?.sub ?? 'unknown'}`)
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
