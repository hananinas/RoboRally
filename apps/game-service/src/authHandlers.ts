import {
  parseLogin,
  type Login,
  type LoginAcknowledgement,
} from '@robo-rally/game-events'
import type { GameSocket } from '@/gameServer'
import { logError } from '@/logger'
import type { UserRegistry } from '@/userRegistry'

export type AuthHandlerDeps = {
  users: UserRegistry
}

export function handleLogin(
  socket: GameSocket,
  { users }: AuthHandlerDeps,
  payload: Login,
  acknowledge: LoginAcknowledgement,
): void {
  if (typeof acknowledge !== 'function') return

  const parsed = parseLogin(payload)
  if (parsed.isErr()) {
    logError('Rejected login request', parsed.error, { command: 'user.login', payload })
    acknowledge({ outcome: parsed.error })
    return
  }
  const { username } = parsed.value

  if (socket.data.user) {
    acknowledge(
      socket.data.user.username === username
        ? { outcome: 'LOGGED_IN', user: socket.data.user }
        : { outcome: 'ALREADY_LOGGED_IN' },
    )
    return
  }

  try {
    const user = users.findOrCreate(username)
    socket.data.user = user
    acknowledge({ outcome: 'LOGGED_IN', user })
  } catch (error) {
    logError('Failed to find or create user', error, { command: 'user.login', payload })
    acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
}
