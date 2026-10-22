import { describe, expect, it } from 'vitest'
import { emptyRequestSchema, leaveGameSchema, lobbyRequestSchema } from '../src/index.js'

const lobbyId = '00000000-0000-4000-8000-000000000001'

describe('emptyRequestSchema', () => {
  it('accepts the empty session, list and create request', () => {
    expect(emptyRequestSchema.parse({})).toEqual({})
  })

  it.each([null, undefined, [], '', 0, { lobbyId }, { gameId: lobbyId }])(
    'rejects nonempty or malformed requests %#',
    (payload) => {
      expect(emptyRequestSchema.safeParse(payload).success).toBe(false)
    },
  )
})

describe('lobbyRequestSchema', () => {
  it('accepts only a lobby UUID for join, leave and start', () => {
    expect(lobbyRequestSchema.parse({ lobbyId })).toEqual({ lobbyId })
  })

  it.each([
    null,
    [],
    {},
    { lobbyId: undefined },
    { lobbyId: 'lobby' },
    { lobbyId: 1 },
    { gameId: lobbyId },
    { lobbyId, gameId: lobbyId },
    { lobbyId, ownerUserId: lobbyId },
  ])('rejects malformed or extra request fields %#', (payload) => {
    expect(lobbyRequestSchema.safeParse(payload).success).toBe(false)
  })
})

describe('leaveGameSchema', () => {
  it('retains strict game departure requests independently of lobby requests', () => {
    expect(leaveGameSchema.parse({ gameId: lobbyId })).toEqual({ gameId: lobbyId })
    expect(leaveGameSchema.safeParse({ lobbyId }).success).toBe(false)
    expect(leaveGameSchema.safeParse({ gameId: lobbyId, playerId: lobbyId }).success).toBe(false)
  })
})
