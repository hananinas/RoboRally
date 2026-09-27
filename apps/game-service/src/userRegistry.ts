import { randomUUID } from 'node:crypto'
import type { User } from '@robo-rally/game-events'

export type UserRegistry = Readonly<{
  findOrCreate(username: string): User
}>

export function createUserRegistry(): UserRegistry {
  const usersByUsername = new Map<string, User>()

  return {
    findOrCreate(username) {
      const existing = usersByUsername.get(username)
      if (existing) return existing

      const user: User = Object.freeze({ userId: randomUUID(), username })
      usersByUsername.set(username, user)
      return user
    },
  }
}
