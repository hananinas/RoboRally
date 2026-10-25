import { describe, expect, it } from 'vitest'
import { Integer, PositiveInteger, UnsignedInteger } from '@/numbers'

describe('Integer', () => {
  it('accepts integers, including negative ones', () => {
    expect(Integer(0)).toBe(0)
    expect(Integer(-5)).toBe(-5)
    expect(Integer(5)).toBe(5)
  })

  it('rejects non-integers', () => {
    expect(() => Integer(1.5)).toThrow(RangeError)
    expect(() => Integer(Number.NaN)).toThrow(RangeError)
  })
})

describe('UnsignedInteger', () => {
  it('accepts zero and positive integers', () => {
    expect(UnsignedInteger(0)).toBe(0)
    expect(UnsignedInteger(5)).toBe(5)
  })

  it('rejects negative numbers and non-integers', () => {
    expect(() => UnsignedInteger(-1)).toThrow(RangeError)
    expect(() => UnsignedInteger(1.5)).toThrow(RangeError)
  })
})

describe('PositiveInteger', () => {
  it('accepts positive integers', () => {
    expect(PositiveInteger(1)).toBe(1)
    expect(PositiveInteger(5)).toBe(5)
  })

  it('rejects zero, negative numbers, and non-integers', () => {
    expect(() => PositiveInteger(0)).toThrow(RangeError)
    expect(() => PositiveInteger(-1)).toThrow(RangeError)
    expect(() => PositiveInteger(1.5)).toThrow(RangeError)
  })
})
