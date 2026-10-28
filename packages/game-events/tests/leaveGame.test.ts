import { describe, expect, it } from 'vitest'
import { leaveGameSchema } from '../src/index.js'

const lobbyId = '00000000-0000-4000-8000-000000000001'

describe('leaveGameSchema', () => {
  it('retains strict game departure requests independently of lobby requests', () => {
    expect(leaveGameSchema.parse({ gameId: lobbyId })).toEqual({ gameId: lobbyId })
    expect(leaveGameSchema.safeParse({ lobbyId }).success).toBe(false)
    expect(leaveGameSchema.safeParse({ gameId: lobbyId, playerId: lobbyId }).success).toBe(false)
  })
})
