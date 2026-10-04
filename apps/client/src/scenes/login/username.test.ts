import { describe, expect, it } from 'vitest'
import { isValidUsername } from './username.ts'

describe('isValidUsername', () => {
  it.each([
    ['one character', 'a'],
    ['thirty characters', 'a'.repeat(30)],
    ['whitespace', '   '],
    ['thirty Unicode code points', '🤖'.repeat(30)],
  ])('accepts %s', (_description, username) => {
    expect(isValidUsername(username)).toBe(true)
  })

  it.each([
    ['an empty username', ''],
    ['thirty-one characters', 'a'.repeat(31)],
    ['thirty-one Unicode code points', '🤖'.repeat(31)],
  ])('rejects %s', (_description, username) => {
    expect(isValidUsername(username)).toBe(false)
  })
})
