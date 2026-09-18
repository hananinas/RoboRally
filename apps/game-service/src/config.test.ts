import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAME_SERVICE_PORT,
  parseGameServicePort,
} from './config.js'

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
})
