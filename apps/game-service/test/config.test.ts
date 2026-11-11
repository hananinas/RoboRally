import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAME_SERVICE_PORT,
  DEFAULT_REFRESH_BUFFER_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  parseGameServicePort,
  parseRefreshBufferSeconds,
  parseRefreshTokenTtlSeconds,
  parseAppConfig,
  parseCardSeed,
  parseStartTileOrder,
} from '@/config.ts'

describe('game service configuration', () => {
  it('uses the default or a configured port', () => {
    expect(parseGameServicePort(undefined)).toBe(DEFAULT_GAME_SERVICE_PORT)
    expect(parseGameServicePort('4321')).toBe(4321)
  })

  it.each(['', '0', '1.5', '65536', 'not-a-port'])(
    'rejects invalid PORT %j',
    (value) => {
      expect(() => parseGameServicePort(value)).toThrow(RangeError)
    },
  )

  it('uses the default or a configured refresh buffer', () => {
    expect(parseRefreshBufferSeconds(undefined)).toBe(DEFAULT_REFRESH_BUFFER_SECONDS)
    expect(parseRefreshBufferSeconds('30')).toBe(30)
  })

  it.each(['', '0', '1.5', 'not-a-number'])(
    'rejects invalid REFRESH_BUFFER_SECONDS %j',
    (value) => {
      expect(() => parseRefreshBufferSeconds(value)).toThrow(RangeError)
    },
  )

  it('uses the default or a configured refresh token TTL', () => {
    expect(parseRefreshTokenTtlSeconds(undefined)).toBe(DEFAULT_REFRESH_TOKEN_TTL_SECONDS)
    expect(parseRefreshTokenTtlSeconds('3600')).toBe(3600)
  })

  it.each(['', '0', '1.5', 'not-a-number'])(
    'rejects invalid REFRESH_TOKEN_TTL_SECONDS %j',
    (value) => {
      expect(() => parseRefreshTokenTtlSeconds(value)).toThrow(RangeError)
    },
  )
  it('picks starting tiles at random unless ordered placement is configured', () => {
    expect(parseStartTileOrder(undefined)).toBe('random')
    expect(parseStartTileOrder('ordered')).toBe('ordered')
    expect(() => parseStartTileOrder('first')).toThrow(RangeError)
  })

  it('draws cards at random unless a card seed is configured', () => {
    expect(parseCardSeed(undefined)).toBeUndefined()
    expect(parseCardSeed('0')).toBe(0)
    expect(parseCardSeed('42')).toBe(42)
    for (const value of ['', '-1', '1.5', 'abc']) {
      expect(() => parseCardSeed(value)).toThrow(RangeError)
    }
  })

  it('only allows a card seed outside production', () => {
    expect(parseAppConfig({ CARD_SEED: '7' }).cardSeed).toBe(7)
    expect(parseAppConfig({ NODE_ENV: 'development', CARD_SEED: '7' }).cardSeed).toBe(7)
    expect(parseAppConfig({ NODE_ENV: 'production' }).cardSeed).toBeUndefined()
    expect(() => parseAppConfig({ NODE_ENV: 'production', CARD_SEED: '7' })).toThrow('CARD_SEED')
  })
})
