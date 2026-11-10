import { PositiveInteger } from '@/numbers'

export const DEFAULT_GAME_SERVICE_PORT = 3001

export function parseGameServicePort(value: string | undefined): number {
  const port = PositiveInteger(value === undefined ? DEFAULT_GAME_SERVICE_PORT : Number(value))
  if (port > 65_535) {
    throw new RangeError('PORT must be an integer between 1 and 65535')
  }
  return port
}

export const DEFAULT_HYDRA_ISSUER_URL = 'https://127.0.0.1:3001/ory/hydra/'
export const DEFAULT_OAUTH_CLIENT_ID = 'game-service'
export const DEFAULT_OAUTH_CLIENT_SECRET = 'game-service-dev-secret'
export const DEFAULT_AUTH_CALLBACK_URL = 'https://127.0.0.1:3001/auth/callback'
export const DEFAULT_POST_LOGOUT_REDIRECT_URL = 'https://127.0.0.1:3001/'
export const DEFAULT_KRATOS_SETTINGS_URL = 'https://127.0.0.1:3001/ory/ui/settings'

export function parseUrlEnv(value: string | undefined, fallback: string): URL {
  return new URL(value ?? fallback)
}

export type OidcConfig = Readonly<{
  issuerUrl: URL
  clientId: string
  clientSecret: string
  callbackUrl: URL
  postLogoutRedirectUrl: URL
}>

export function parseOidcConfig(env: Partial<Record<
  'HYDRA_ISSUER_URL' | 'OAUTH_CLIENT_ID' | 'OAUTH_CLIENT_SECRET' | 'AUTH_CALLBACK_URL' | 'POST_LOGOUT_REDIRECT_URL',
  string
>>): OidcConfig {
  return {
    issuerUrl: parseUrlEnv(env.HYDRA_ISSUER_URL, DEFAULT_HYDRA_ISSUER_URL),
    clientId: env.OAUTH_CLIENT_ID ?? DEFAULT_OAUTH_CLIENT_ID,
    clientSecret: env.OAUTH_CLIENT_SECRET ?? DEFAULT_OAUTH_CLIENT_SECRET,
    callbackUrl: parseUrlEnv(env.AUTH_CALLBACK_URL, DEFAULT_AUTH_CALLBACK_URL),
    postLogoutRedirectUrl: parseUrlEnv(env.POST_LOGOUT_REDIRECT_URL, DEFAULT_POST_LOGOUT_REDIRECT_URL),
  }
}

export function parseKratosSettingsUrl(value: string | undefined): URL {
  return parseUrlEnv(value, DEFAULT_KRATOS_SETTINGS_URL)
}

export type StartTileOrder = 'random' | 'ordered'

export function parseStartTileOrder(value: string | undefined): StartTileOrder {
  if (value === undefined || value === 'random' || value === 'ordered') return value ?? 'random'
  throw new RangeError('START_TILE_ORDER must be "random" or "ordered"')
}

// Test-only: makes card draws deterministic. parseAppConfig rejects it in production.
export function parseCardSeed(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) throw new RangeError('CARD_SEED must be a non-negative integer')
  return Number(value)
}

export type AppConfig = Readonly<{
  port: number
  kratosSettingsUrl: URL
  oidc: OidcConfig
  startTileOrder: StartTileOrder
  cardSeed: number | undefined
}>

export function parseAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  if (env.NODE_ENV === 'production' && env.CARD_SEED !== undefined) {
    throw new Error('CARD_SEED is test-only and must not be set in production')
  }
  return {
    port: parseGameServicePort(env.PORT),
    kratosSettingsUrl: parseKratosSettingsUrl(env.KRATOS_SETTINGS_URL),
    oidc: parseOidcConfig(env),
    startTileOrder: parseStartTileOrder(env.START_TILE_ORDER),
    cardSeed: parseCardSeed(env.CARD_SEED),
  }
}
