import { describe, expect, it } from 'vitest'
import { submitProgramSchema } from '../src/index.js'

const cardIds = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
] as const

const validPayload = { cardIds }

describe('submitProgramSchema', () => {
  it('accepts five distinct card IDs in register order', () => {
    expect(submitProgramSchema.parse(validPayload)).toEqual(validPayload)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a primitive', 'program'],
    ['an empty object', {}],
    ['a legacy round number', { ...validPayload, roundNumber: 1 }],
    ['a missing card list', { ...validPayload, cardIds: undefined }],
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
    expect(() => submitProgramSchema.parse(payload)).toThrow()
  })
})
