import { describe, expect, it } from 'vitest'
import { parseSubmitProgram } from '../src/index.js'

const gameId = '00000000-0000-4000-8000-000000000000'
const cardIds = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
] as const

const validPayload = { gameId, cardIds }

describe('parseSubmitProgram', () => {
  it('accepts five distinct card IDs in register order', () => {
    expect(parseSubmitProgram(validPayload)).toEqual(validPayload)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a primitive', 'program'],
    ['an empty object', {}],
    ['a missing game ID', { cardIds }],
    ['a missing card list', { gameId }],
    ['an invalid game ID', { gameId: 'game-1', cardIds }],
    ['a non-array card list', { gameId, cardIds: 'card-ids' }],
    ['four cards', { gameId, cardIds: cardIds.slice(0, 4) }],
    ['six cards', { gameId, cardIds: [...cardIds, cardIds[0]] }],
    [
      'duplicate cards',
      {
        gameId,
        cardIds: [
          cardIds[0],
          cardIds[1],
          cardIds[2],
          cardIds[3],
          cardIds[0],
        ],
      },
    ],
    [
      'an invalid card ID',
      {
        gameId,
        cardIds: [
          cardIds[0],
          cardIds[1],
          cardIds[2],
          cardIds[3],
          'card-5',
        ],
      },
    ],
    ['an extra property', { ...validPayload, playerId: 'player-1' }],
  ])('rejects %s', (_description, payload) => {
    expect(() => parseSubmitProgram(payload)).toThrow()
  })
})
