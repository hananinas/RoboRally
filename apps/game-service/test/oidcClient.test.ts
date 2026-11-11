import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from 'openid-client'
import { createOidcClient } from '@/infra/oidcClient.ts'
import type { OidcConfig } from '@/config.ts'

vi.mock('openid-client', () => ({
  discovery: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
  buildEndSessionUrl: vi.fn(),
  refreshTokenGrant: vi.fn(),
}))

const oidcConfig: OidcConfig = {
  issuerUrl: new URL('https://hydra.test/'),
  clientId: 'game-service',
  clientSecret: 'game-service-dev-secret',
  callbackUrl: new URL('http://127.0.0.1:3001/auth/callback'),
  postLogoutRedirectUrl: new URL('http://127.0.0.1:3001/'),
  refreshBufferSeconds: 60,
}

const fakeConfig = { fake: 'configuration' } as unknown as client.Configuration

beforeEach(() => {
  vi.mocked(client.discovery).mockReset().mockResolvedValue(fakeConfig)
  vi.mocked(client.buildAuthorizationUrl).mockReset()
  vi.mocked(client.authorizationCodeGrant).mockReset()
  vi.mocked(client.buildEndSessionUrl).mockReset()
  vi.mocked(client.refreshTokenGrant).mockReset()
})

describe('createOidcClient', () => {
  it('discovers the issuer using the configured client id and secret', async () => {
    const oidcClient = await createOidcClient(oidcConfig)
    await oidcClient.buildAuthorizationUrl({})

    expect(client.discovery).toHaveBeenCalledWith(
      oidcConfig.issuerUrl,
      oidcConfig.clientId,
      oidcConfig.clientSecret,
    )
  })

  it('only discovers the issuer once, even across multiple calls', async () => {
    const oidcClient = await createOidcClient(oidcConfig)
    await oidcClient.buildAuthorizationUrl({})
    await oidcClient.exchangeAuthorizationCode('/auth/callback?code=abc&state=xyz', {
      pkceCodeVerifier: 'verifier',
      expectedState: 'xyz',
    })

    expect(client.discovery).toHaveBeenCalledTimes(1)
  })

  describe('buildAuthorizationUrl', () => {
    it('includes the configured redirect_uri alongside caller-supplied params', async () => {
      const expectedUrl = new URL('https://hydra.test/oauth2/auth?state=xyz')
      vi.mocked(client.buildAuthorizationUrl).mockReturnValue(expectedUrl)

      const oidcClient = await createOidcClient(oidcConfig)
      const url = await oidcClient.buildAuthorizationUrl({ scope: 'openid', state: 'xyz' })

      expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(fakeConfig, {
        redirect_uri: oidcConfig.callbackUrl.toString(),
        scope: 'openid',
        state: 'xyz',
      })
      expect(url).toBe(expectedUrl)
    })
  })

  describe('exchangeAuthorizationCode', () => {
    it('resolves a relative callback request URL against the configured callback URL', async () => {
      const oidcClient = await createOidcClient(oidcConfig)
      await oidcClient.exchangeAuthorizationCode('/auth/callback?code=abc&state=xyz', {
        pkceCodeVerifier: 'verifier',
        expectedState: 'xyz',
      })

      expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
        fakeConfig,
        new URL('http://127.0.0.1:3001/auth/callback?code=abc&state=xyz'),
        { pkceCodeVerifier: 'verifier', expectedState: 'xyz' },
      )
    })

    it('returns the token response from the exchange', async () => {
      const tokens = { access_token: 'at', claims: () => undefined }
      vi.mocked(client.authorizationCodeGrant).mockResolvedValue(
        tokens as unknown as client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
      )

      const oidcClient = await createOidcClient(oidcConfig)
      const result = await oidcClient.exchangeAuthorizationCode('/auth/callback?code=abc&state=xyz', {
        pkceCodeVerifier: 'verifier',
        expectedState: 'xyz',
      })

      expect(result).toBe(tokens)
    })
  })

  describe('buildEndSessionUrl', () => {
    it('passes the configured post_logout_redirect_uri and the given id token hint', async () => {
      const expectedUrl = new URL('https://hydra.test/oauth2/sessions/logout')
      vi.mocked(client.buildEndSessionUrl).mockReturnValue(expectedUrl)

      const oidcClient = await createOidcClient(oidcConfig)
      const url = await oidcClient.buildEndSessionUrl('the-id-token')

      expect(client.buildEndSessionUrl).toHaveBeenCalledWith(fakeConfig, {
        post_logout_redirect_uri: oidcConfig.postLogoutRedirectUrl.toString(),
        id_token_hint: 'the-id-token',
      })
      expect(url).toBe(expectedUrl)
    })
  })

  describe('refreshToken', () => {
    it('redeems the given refresh token using the discovered configuration', async () => {
      const tokens = { access_token: 'at', claims: () => undefined }
      vi.mocked(client.refreshTokenGrant).mockResolvedValue(
        tokens as unknown as client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
      )

      const oidcClient = await createOidcClient(oidcConfig)
      const result = await oidcClient.refreshToken('refresh-token-abc')

      expect(client.refreshTokenGrant).toHaveBeenCalledWith(fakeConfig, 'refresh-token-abc')
      expect(result).toBe(tokens)
    })
  })
})
