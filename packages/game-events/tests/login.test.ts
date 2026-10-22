import { describe, expect, it } from 'vitest'
import { parseLogin } from '../src/index.js'

describe('parseLogin', () => {
  it.each([
    'a',
    'a'.repeat(30),
    '\u{1F600}'.repeat(30),
    '  ',
    'Dane',
    'dane',
    'é',
    'é',
  ])('preserves the exact valid username %j', (username) => {
    expect(parseLogin({ username })._unsafeUnwrap()).toEqual({ username })
  })

  it.each([
    {},
    { username: null },
    { username: 1 },
    { username: '' },
    { username: 'a'.repeat(31) },
    { username: '\u{1F600}'.repeat(31) },
  ])('rejects invalid usernames', (payload) => {
    expect(parseLogin(payload)._unsafeUnwrapErr()).toBe('INVALID_USERNAME')
  })

  it.each([
    null,
    [],
    'Dane',
    { username: 'Dane', extra: true },
    { username: '', extra: true },
  ])('rejects malformed request shapes', (payload) => {
    expect(parseLogin(payload)._unsafeUnwrapErr()).toBe('INVALID_REQUEST')
  })
})
