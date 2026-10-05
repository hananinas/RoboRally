import { describe, expect, it } from 'vitest'
import { LobbyRequestError, parseCreateLobby, parseJoinLobby } from '../src/index.js'

describe('lobby request parsers', () => {
  it('trims lobby names and accepts supported maps and numeric codes', () => {
    expect(parseCreateLobby({ name: ' Workshop ', code: '4821', map: 'Map 2' })).toEqual({
      name: 'Workshop',
      code: '4821',
      map: 'Map 2',
    })
  })

  it.each([
    null,
    {},
    { name: '', code: '4821', map: 'Map 1' },
    { name: 'x'.repeat(33), code: '4821', map: 'Map 1' },
    { name: 'Workshop', code: '123', map: 'Map 1' },
    { name: 'Workshop', code: '48A1', map: 'Map 1' },
    { name: 'Workshop', code: '4821', map: 'Map 3' },
    { name: 'Workshop', code: '4821', map: 'Map 1', extra: true },
  ])('rejects invalid lobby creation payloads', (payload) => {
    expect(() => parseCreateLobby(payload)).toThrow(LobbyRequestError)
  })

  it('accepts a four-digit lobby code', () => {
    expect(parseJoinLobby({ code: '4821' })).toEqual({ code: '4821' })
  })

  it.each([null, {}, { code: 'AB12' }, { code: '123' }, { code: '12345' }])(
    'rejects invalid lobby join payloads',
    (payload) => expect(() => parseJoinLobby(payload)).toThrow(LobbyRequestError),
  )
})