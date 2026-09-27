import { describe, expect, it } from 'vitest'
import { LoginRequestError, parseLogin } from '../src/index.js'

describe('parseLogin', () => {
  it.each([
    'a',
    'a'.repeat(30),
    '😀'.repeat(30),
    '  ',
    'Dane',
    'dane',
    'e\u0301',
    'é',
  ])('preserves the exact valid username %j', (username) => {
    expect(parseLogin({ username })).toEqual({ username })
  })

  it.each([
    {},
    { username: null },
    { username: 1 },
    { username: '' },
    { username: 'a'.repeat(31) },
    { username: '😀'.repeat(31) },
  ])('rejects invalid usernames', (payload) => {
    expect(() => parseLogin(payload)).toThrowError(
      new LoginRequestError('INVALID_USERNAME'),
    )
  })

  it.each([
    null,
    [],
    'Dane',
    { username: 'Dane', extra: true },
    { username: '', extra: true },
  ])('rejects malformed request shapes', (payload) => {
    expect(() => parseLogin(payload)).toThrowError(
      new LoginRequestError('INVALID_REQUEST'),
    )
  })
})
