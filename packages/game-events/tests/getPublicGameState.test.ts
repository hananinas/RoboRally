import { describe, expect, it } from 'vitest'
import { parseGetPublicGameState } from '../src/index.js'

const validPayload = {
  gameId: '00000000-0000-4000-8000-000000000000',
}

describe('parseGetPublicGameState', () => {
  it('accepts a game UUID', () => {
    expect(parseGetPublicGameState(validPayload)).toEqual(validPayload)
  })

  it.each([
    ['null', null],
    ['an empty object', {}],
    ['an invalid game ID', { gameId: 'game' }],
    ['an extra property', { ...validPayload, extra: true }],
  ])('rejects %s', (_description, payload) => {
    expect(() => parseGetPublicGameState(payload)).toThrow()
  })
})
