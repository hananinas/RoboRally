import * as client from 'openid-client'
import type { OidcConfig } from '@/config'

export type OidcClient = Readonly<{
  buildAuthorizationUrl(params: Record<string, string>): Promise<URL>
  exchangeAuthorizationCode(
    requestUrl: string,
    checks: { pkceCodeVerifier: string; expectedState: string },
  ): Promise<client.TokenEndpointResponse & client.TokenEndpointResponseHelpers>
  buildEndSessionUrl(idTokenHint: string): Promise<URL>
  postLogoutRedirectUrl: URL
}>

export async function createOidcClient(oidcConfig: OidcConfig): Promise<OidcClient> {
  const config = await client.discovery(oidcConfig.issuerUrl, oidcConfig.clientId, oidcConfig.clientSecret)

  return {
    postLogoutRedirectUrl: oidcConfig.postLogoutRedirectUrl,
    async buildAuthorizationUrl(params) {
      return client.buildAuthorizationUrl(config, {
        redirect_uri: oidcConfig.callbackUrl.toString(),
        ...params,
      })
    },
    async exchangeAuthorizationCode(requestUrl, checks) {
      const currentUrl = new URL(requestUrl, oidcConfig.callbackUrl)
      return client.authorizationCodeGrant(config, currentUrl, checks)
    },
    async buildEndSessionUrl(idTokenHint) {
      return client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: oidcConfig.postLogoutRedirectUrl.toString(),
        id_token_hint: idTokenHint,
      })
    },
  }
}
