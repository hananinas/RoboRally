import { describe, expect, it } from 'vitest'
import { updateRegistersSchema } from '../src/index.js'

const gameId = '00000000-0000-4000-8000-000000000001'
const playerId = '00000000-0000-4000-8000-000000000002'
const cardId = '00000000-0000-4000-8000-000000000101'
const cardIds = [cardId, null, null, null, null]
const payload = { cardIds }

describe('updateRegistersSchema', () => {
  it('preserves five card IDs or nulls in register order', () => {
    expect(updateRegistersSchema.parse(payload)).toEqual(payload)
    expect(updateRegistersSchema.parse({ cardIds: [null, null, null, null, null] }).cardIds)
      .toEqual([null, null, null, null, null])
    // Card ownership and uniqueness are domain checks returning INVALID_PROGRAM.
    expect(updateRegistersSchema.parse({ cardIds: Array(5).fill(cardId) }).cardIds)
      .toEqual(Array(5).fill(cardId))
  })

  it.each([
    null,
    [],
    'registers',
    {},
    { ...payload, gameId },
    { ...payload, playerId },
    { cardIds: undefined },
    { cardIds: cardId },
    { cardIds: cardIds.slice(0, 4) },
    { cardIds: [...cardIds, null] },
    { cardIds: [1, null, null, null, null] },
    { cardIds: [true, null, null, null, null] },
    { cardIds: ['not-a-uuid', null, null, null, null] },
    { cardIds: [undefined, null, null, null, null] },
    { cardIds: [{ id: cardId }, null, null, null, null] },
    { cardIds: new Array(5) },
    { occupied: [true, false, false, false, false] },
    { ...payload, occupied: [true, false, false, false, false] },
    { ...payload, extra: true },
  ])('rejects malformed or identity-bearing payload %#', (input) => {
    expect(updateRegistersSchema.safeParse(input).success).toBe(false)
  })
})
