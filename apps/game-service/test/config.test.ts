import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAME_SERVICE_PORT,
  DEFAULT_REFRESH_BUFFER_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  parseGameServicePort,
  parseRefreshBufferSeconds,
  parseRefreshTokenTtlSeconds,
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
})
