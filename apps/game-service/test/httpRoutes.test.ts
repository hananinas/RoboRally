import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCookie } from 'cookie'
import { createAuthApp } from '@/auth/httpRoutes.ts'
import type { OidcClient } from '@/infra/oidcClient.ts'

describe('GET /auth/login', () => {
  let baseUrl: string
  let server: Server
  const oidcClient: OidcClient = {
    buildAuthorizationUrl: vi.fn<OidcClient['buildAuthorizationUrl']>(),
    exchangeAuthorizationCode: vi.fn<OidcClient['exchangeAuthorizationCode']>(),
  }

  beforeAll(async () => {
    server = createServer(createAuthApp({ oidcClient }))
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

  it('requests an openid scope with a PKCE S256 code challenge', async () => {
    vi.mocked(oidcClient.buildAuthorizationUrl).mockResolvedValue(new URL('https://hydra.test/oauth2/auth'))

    await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' })

    expect(oidcClient.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'openid',
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
