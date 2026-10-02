import { loginSchema } from '@robo-rally/game-events'

export function isValidUsername(username: string): boolean {
  return loginSchema.safeParse({ username }).success
}
