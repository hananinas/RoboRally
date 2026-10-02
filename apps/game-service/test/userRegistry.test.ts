import { describe, expect, it } from 'vitest'
import { createUserRegistry } from '@/userRegistry.ts'

describe('user registry', () => {
  it('returns the same user for repeated exact usernames', () => {
    const registry = createUserRegistry()
    const first = registry.findOrCreate('Dane')

    expect(first).toEqual({ userId: expect.any(String), username: 'Dane' })
    expect(first.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(registry.findOrCreate('Dane')).toBe(first)
  })

  it('keeps case, whitespace, and normalization differences distinct', () => {
    const registry = createUserRegistry()
    const users = ['Dane', 'dane', ' Dane', 'é', 'e\u0301'].map((username) =>
      registry.findOrCreate(username),
    )

    expect(new Set(users.map((user) => user.userId)).size).toBe(users.length)
    expect(users.map((user) => user.username)).toEqual([
      'Dane', 'dane', ' Dane', 'é', 'e\u0301',
    ])
  })

  it('scopes stored users to a registry instance', () => {
    const first = createUserRegistry().findOrCreate('Dane')
    const second = createUserRegistry().findOrCreate('Dane')

    expect(second.userId).not.toBe(first.userId)
  })
})
