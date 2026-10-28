import express, { type ErrorRequestHandler, type Express } from 'express'
import { stringifySetCookie } from 'cookie'
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client'
import type { OidcClient } from '@/infra/oidcClient'
import { logError } from '@/logger'

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
