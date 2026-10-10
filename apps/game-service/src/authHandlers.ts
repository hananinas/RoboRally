import {
  LoginRequestError,
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

  let username: string
  try {
    username = parseLogin(payload).username
  } catch (error) {
    logError('Rejected login request', error, { payload })
    acknowledge({
      outcome:
        error instanceof LoginRequestError ? error.outcome : 'INTERNAL_ERROR',
    })
    return
  }

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
    logError('Failed to find or create user', error, { username })
    acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
}
