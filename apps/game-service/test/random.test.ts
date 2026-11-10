import { describe, expect, it } from 'vitest'
import { seededRandom } from '@/random.ts'

describe('seededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const first = seededRandom(7)
    const second = seededRandom(7)
    expect(Array.from({ length: 5 }, first)).toEqual(Array.from({ length: 5 }, second))
  })

  it('produces different sequences for different seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)())
  })

  it('stays within [0, 1)', () => {
    const random = seededRandom(123)
    for (let i = 0; i < 1000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
