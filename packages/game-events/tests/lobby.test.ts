import { describe, expect, it } from 'vitest'
import { emptyRequestSchema, lobbyRequestSchema } from '../src/lobby.js'

describe('lobby requests', () => {
  it('accepts empty discovery/create requests and UUID lobby identifiers', () => {
    expect(emptyRequestSchema.safeParse({}).success).toBe(true)
    expect(lobbyRequestSchema.safeParse({ lobbyId: '00000000-0000-4000-8000-000000000001' }).success).toBe(true)
  })
  it('rejects missing, malformed and extra fields', () => {
    for (const payload of [null, [], { extra: true }]) {
      expect(emptyRequestSchema.safeParse(payload).success).toBe(false)
    }
    for (const payload of [null, {}, { lobbyId: 'not-a-uuid' }, { lobbyId: '00000000-0000-4000-8000-000000000001', owner: true }]) {
      expect(lobbyRequestSchema.safeParse(payload).success).toBe(false)
    }
  })
})
