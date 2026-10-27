import * as client from 'openid-client'
import { parseOidcConfig, type OidcConfig } from '@/config'

export type OidcClient = Readonly<{
  buildAuthorizationUrl(params: Record<string, string>): Promise<URL>
  exchangeAuthorizationCode(
    requestUrl: string,
    checks: { pkceCodeVerifier: string; expectedState: string },
  ): Promise<client.TokenEndpointResponse & client.TokenEndpointResponseHelpers>
}>

export async function createOidcClient(
  oidcConfig: OidcConfig = parseOidcConfig(process.env),
): Promise<OidcClient> {
  const config = await client.discovery(oidcConfig.issuerUrl, oidcConfig.clientId, oidcConfig.clientSecret)

  return {
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
  }
}
