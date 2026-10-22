import { describe, expect, it } from 'vitest'
import { updateRegistersSchema } from '../src/index.js'

const gameId = '00000000-0000-4000-8000-000000000001'
const playerId = '00000000-0000-4000-8000-000000000002'
const occupied = [true, false, true, false, false]
const payload = { gameId, playerId, occupied }

describe('updateRegistersSchema', () => {
  it('preserves five occupancy flags in register order without card identities', () => {
    expect(updateRegistersSchema.parse(payload)).toEqual(payload)
    expect(updateRegistersSchema.parse({ ...payload, occupied: [false, false, false, false, false] }).occupied)
      .toEqual([false, false, false, false, false])
    expect(updateRegistersSchema.parse({ ...payload, occupied: [true, true, true, true, true] }).occupied)
      .toEqual([true, true, true, true, true])
  })

  it.each([
    null,
    [],
    'registers',
    {},
    { ...payload, gameId: undefined },
    { ...payload, playerId: undefined },
    { ...payload, gameId: 'game' },
    { ...payload, playerId: 'player' },
    { ...payload, occupied: undefined },
    { ...payload, occupied: 'true,false,true,false,false' },
    { ...payload, occupied: occupied.slice(0, 4) },
    { ...payload, occupied: [...occupied, true] },
    { ...payload, occupied: [1, false, true, false, false] },
    { ...payload, occupied: ['true', false, true, false, false] },
    { ...payload, occupied: [null, false, true, false, false] },
    { ...payload, occupied: [undefined, false, true, false, false] },
    { ...payload, occupied: [{ status: 'HIDDEN' }, false, true, false, false] },
    { ...payload, occupied: new Array(5) },
    { ...payload, cardIds: [] },
    { ...payload, extra: true },
  ])('rejects malformed or identity-bearing payload %#', (input) => {
    expect(updateRegistersSchema.safeParse(input).success).toBe(false)
  })
})
