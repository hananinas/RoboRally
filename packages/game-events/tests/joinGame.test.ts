import { describe, expect, it } from 'vitest'
import { parseJoinGame } from '../src/index.js'

describe('game join parser', () => {
  it('accepts a game UUID', () => {
    expect(parseJoinGame({ gameId: '00000000-0000-4000-8000-000000000001' })).toEqual({
      gameId: '00000000-0000-4000-8000-000000000001',
    })
  })

  it.each([null, {}, { gameId: 'not-a-uuid' }, { gameId: '00000000-0000-4000-8000-000000000001', extra: true }])(
    'rejects invalid game join payloads',
    (payload) => expect(() => parseJoinGame(payload)).toThrow(),
  )
})