import { describe, expect, it } from 'vitest'
import { parseSubmitProgram } from '../src/index.js'

const gameId = '00000000-0000-4000-8000-000000000000'
const playerId = '00000000-0000-4000-8000-000000000099'
const cardIds = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
] as const

const validPayload = { gameId, playerId, roundNumber: 1, cardIds }

describe('parseSubmitProgram', () => {
  it('accepts five distinct card IDs in register order', () => {
    expect(parseSubmitProgram(validPayload)).toEqual(validPayload)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a primitive', 'program'],
    ['an empty object', {}],
    ['a missing game ID', { ...validPayload, gameId: undefined }],
    ['a missing player ID', { ...validPayload, playerId: undefined }],
    ['a missing round', { ...validPayload, roundNumber: undefined }],
    ['a zero round', { ...validPayload, roundNumber: 0 }],
    ['a fractional round', { ...validPayload, roundNumber: 1.5 }],
    ['a missing card list', { ...validPayload, cardIds: undefined }],
    ['an invalid game ID', { ...validPayload, gameId: 'game-1' }],
    ['an invalid player ID', { ...validPayload, playerId: 'player-1' }],
    ['a non-array card list', { ...validPayload, cardIds: 'card-ids' }],
    ['four cards', { ...validPayload, cardIds: cardIds.slice(0, 4) }],
    ['six cards', { ...validPayload, cardIds: [...cardIds, cardIds[0]] }],
    [
      'duplicate cards',
      {
        ...validPayload,
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
        ...validPayload,
        cardIds: [
          cardIds[0],
          cardIds[1],
          cardIds[2],
          cardIds[3],
          'card-5',
        ],
      },
    ],
    ['an extra property', { ...validPayload, extra: true }],
  ])('rejects %s', (_description, payload) => {
    expect(() => parseSubmitProgram(payload)).toThrow()
  })
})
