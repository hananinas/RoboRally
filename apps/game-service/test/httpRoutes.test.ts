import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCookie } from 'cookie'
import { createAuthApp } from '@/auth/httpRoutes.ts'
import { createSessionStore } from '@/auth/sessionStore.ts'
import type { OidcClient } from '@/infra/oidcClient.ts'

const kratosSettingsUrl = new URL('http://127.0.0.1:4455/settings')

describe('GET /auth/login', () => {
  let baseUrl: string
  let server: Server
  const oidcClient: OidcClient = {
    buildAuthorizationUrl: vi.fn<OidcClient['buildAuthorizationUrl']>(),
    exchangeAuthorizationCode: vi.fn<OidcClient['exchangeAuthorizationCode']>(),
    buildEndSessionUrl: vi.fn<OidcClient['buildEndSessionUrl']>(),
    refreshToken: vi.fn<OidcClient['refreshToken']>(),
    postLogoutRedirectUrl: new URL('https://127.0.0.1:3001/'),
  }

  beforeAll(async () => {
    server = createServer(
      createAuthApp({
        oidcClient,
        sessionStore: createSessionStore({ oidcClient, refreshBufferSeconds: 60 }),
        kratosSettingsUrl,
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
  })

  beforeEach(() => {
    vi.mocked(oidcClient.buildAuthorizationUrl).mockReset()
  })

  it('redirects to an authorization URL whose state matches the oauth_state cookie', async () => {
    vi.mocked(oidcClient.buildAuthorizationUrl).mockImplementation(
      async (params) => new URL(`https://hydra.test/oauth2/auth?state=${params.state}`),
    )

    const response = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' })

    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).not.toBeNull()

    const setCookies = response.headers.getSetCookie()
    const cookies = Object.assign({}, ...setCookies.map((cookie) => parseCookie(cookie)))
    expect(cookies.oauth_state).toBeTruthy()
    expect(cookies.oauth_verifier).toBeTruthy()

    const stateInLocation = new URL(location!).searchParams.get('state')
    expect(stateInLocation).toBe(cookies.oauth_state)
  })

  it('sets both transaction cookies as HttpOnly, SameSite=Lax, scoped to /auth/callback', async () => {
    vi.mocked(oidcClient.buildAuthorizationUrl).mockResolvedValue(new URL('https://hydra.test/oauth2/auth'))

    const response = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' })
    const setCookies = response.headers.getSetCookie()

    expect(setCookies).toHaveLength(2)
    for (const cookie of setCookies) {
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Lax/i)
      expect(cookie).toMatch(/Path=\/auth\/callback/i)
    }
  })

  it('requests an openid profile offline_access scope with a PKCE S256 code challenge', async () => {
    vi.mocked(oidcClient.buildAuthorizationUrl).mockResolvedValue(new URL('https://hydra.test/oauth2/auth'))

    await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' })

    expect(oidcClient.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'openid profile offline_access',
        code_challenge_method: 'S256',
        code_challenge: expect.any(String),
        state: expect.any(String),
      }),
    )
  })

  it('responds 500 without crashing when buildAuthorizationUrl rejects', async () => {
    vi.mocked(oidcClient.buildAuthorizationUrl).mockRejectedValue(new Error('discovery unreachable'))

    const response = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' })

    expect(response.status).toBe(500)
  })
})

describe('GET /auth/callback', () => {
  let baseUrl: string
  let server: Server
  const oidcClient: OidcClient = {
    buildAuthorizationUrl: vi.fn<OidcClient['buildAuthorizationUrl']>(),
    exchangeAuthorizationCode: vi.fn<OidcClient['exchangeAuthorizationCode']>(),
    buildEndSessionUrl: vi.fn<OidcClient['buildEndSessionUrl']>(),
    refreshToken: vi.fn<OidcClient['refreshToken']>(),
    postLogoutRedirectUrl: new URL('https://127.0.0.1:3001/'),
  }
  const sessionStore = createSessionStore({ oidcClient, refreshBufferSeconds: 60 })

  beforeAll(async () => {
    server = createServer(createAuthApp({ oidcClient, sessionStore, kratosSettingsUrl }))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
  })

  beforeEach(() => {
    vi.mocked(oidcClient.exchangeAuthorizationCode).mockReset()
  })

  it('rejects with 400 and never calls the OIDC client when transaction cookies are missing', async () => {
    const response = await fetch(`${baseUrl}/auth/callback?code=abc&state=xyz`)

    expect(response.status).toBe(400)
    expect(oidcClient.exchangeAuthorizationCode).not.toHaveBeenCalled()
  })

  it('exchanges the code, creates a session, and clears the transaction cookies on success', async () => {
    vi.mocked(oidcClient.exchangeAuthorizationCode).mockResolvedValue(
      {
        claims: () => ({ sub: 'user-123', preferred_username: 'Bence' }),
        expires_in: 900,
        id_token: 'id-token-abc',
        refresh_token: 'refresh-token-abc',
      } as unknown as Awaited<ReturnType<OidcClient['exchangeAuthorizationCode']>>,
    )

    const response = await fetch(`${baseUrl}/auth/callback?code=abc&state=xyz`, {
      redirect: 'manual',
      headers: { cookie: 'oauth_state=xyz; oauth_verifier=verifier-abc' },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    expect(oidcClient.exchangeAuthorizationCode).toHaveBeenCalledWith('/auth/callback?code=abc&state=xyz', {
      pkceCodeVerifier: 'verifier-abc',
      expectedState: 'xyz',
    })

    const setCookies = response.headers.getSetCookie()
    const transactionCookies = setCookies.filter((cookie) => /Max-Age=0/i.test(cookie))
    expect(transactionCookies).toHaveLength(2)

    const sessionCookie = setCookies.find((cookie) => cookie.startsWith('game_session='))
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toMatch(/HttpOnly/i)
    expect(sessionCookie).toMatch(/SameSite=Lax/i)
    expect(sessionCookie).toMatch(/Path=\//i)
    expect(sessionCookie).toMatch(/Max-Age=900/i)

    const sessionId = parseCookie(sessionCookie!).game_session!
    expect(sessionStore.get(sessionId)).toStrictEqual({ sub: 'user-123', username: 'Bence', idToken: 'id-token-abc' })
  })

  it('responds 400 and clears cookies without creating a session when the ID token has no subject', async () => {
    vi.mocked(oidcClient.exchangeAuthorizationCode).mockResolvedValue(
      { claims: () => ({}) } as unknown as Awaited<ReturnType<OidcClient['exchangeAuthorizationCode']>>,
    )

    const response = await fetch(`${baseUrl}/auth/callback?code=abc&state=xyz`, {
      headers: { cookie: 'oauth_state=xyz; oauth_verifier=verifier-abc' },
    })

    expect(response.status).toBe(400)
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('game_session='))).toBe(false)
  })

  it('responds 400 and clears cookies without creating a session when the refresh token is missing', async () => {
    vi.mocked(oidcClient.exchangeAuthorizationCode).mockResolvedValue(
      {
        claims: () => ({ sub: 'user-123', preferred_username: 'Bence' }),
        expires_in: 900,
        id_token: 'id-token-abc',
      } as unknown as Awaited<ReturnType<OidcClient['exchangeAuthorizationCode']>>,
    )

    const response = await fetch(`${baseUrl}/auth/callback?code=abc&state=xyz`, {
      headers: { cookie: 'oauth_state=xyz; oauth_verifier=verifier-abc' },
    })

    expect(response.status).toBe(400)
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('game_session='))).toBe(false)
  })

  it('responds 400 and still clears the transaction cookies when the exchange fails', async () => {
    vi.mocked(oidcClient.exchangeAuthorizationCode).mockRejectedValue(new Error('invalid_grant'))

    const response = await fetch(`${baseUrl}/auth/callback?code=abc&state=xyz`, {
      headers: { cookie: 'oauth_state=xyz; oauth_verifier=verifier-abc' },
    })

    expect(response.status).toBe(400)
    const setCookies = response.headers.getSetCookie()
    expect(setCookies).toHaveLength(2)
    for (const cookie of setCookies) {
      expect(cookie).toMatch(/Max-Age=0/i)
    }
  })
})

describe('GET /auth/logout', () => {
  let baseUrl: string
  let server: Server
  const oidcClient: OidcClient = {
    buildAuthorizationUrl: vi.fn<OidcClient['buildAuthorizationUrl']>(),
    exchangeAuthorizationCode: vi.fn<OidcClient['exchangeAuthorizationCode']>(),
    buildEndSessionUrl: vi.fn<OidcClient['buildEndSessionUrl']>(),
    refreshToken: vi.fn<OidcClient['refreshToken']>(),
    postLogoutRedirectUrl: new URL('https://127.0.0.1:3001/'),
  }
  const sessionStore = createSessionStore({ oidcClient, refreshBufferSeconds: 60 })

  beforeAll(async () => {
    server = createServer(createAuthApp({ oidcClient, sessionStore, kratosSettingsUrl }))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
  })

  beforeEach(() => {
    vi.mocked(oidcClient.buildEndSessionUrl).mockReset()
  })

  it('destroys the session, clears the cookie, and redirects to the end-session URL with the id token hint', async () => {
    const endSessionUrl = new URL('https://hydra.test/oauth2/sessions/logout')
    vi.mocked(oidcClient.buildEndSessionUrl).mockResolvedValue(endSessionUrl)
    const sessionId = sessionStore.create('user-123', 'Bence', 'id-token-abc', 'refresh-token-abc', 900)

    const response = await fetch(`${baseUrl}/auth/logout`, {
      redirect: 'manual',
      headers: { cookie: `game_session=${sessionId}` },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(endSessionUrl.toString())
    expect(oidcClient.buildEndSessionUrl).toHaveBeenCalledWith('id-token-abc')
    expect(sessionStore.get(sessionId)).toBeUndefined()

    const setCookie = response.headers.getSetCookie()
    expect(setCookie).toHaveLength(1)
    expect(setCookie[0]).toMatch(/Max-Age=0/i)
  })

  it('skips Hydra and redirects straight to the post-logout URL when there is no session', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(oidcClient.postLogoutRedirectUrl.toString())
    expect(oidcClient.buildEndSessionUrl).not.toHaveBeenCalled()
  })

  it('responds 500 without crashing when buildEndSessionUrl rejects', async () => {
    vi.mocked(oidcClient.buildEndSessionUrl).mockRejectedValue(new Error('discovery unreachable'))
    const sessionId = sessionStore.create('user-123', 'Bence', 'id-token-abc', 'refresh-token-abc', 900)

    const response = await fetch(`${baseUrl}/auth/logout`, {
      redirect: 'manual',
      headers: { cookie: `game_session=${sessionId}` },
    })

    expect(response.status).toBe(500)
  })
})
