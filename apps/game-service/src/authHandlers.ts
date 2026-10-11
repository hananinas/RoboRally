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

  let acknowledged = false
  try {
    const parsed = parseLogin(payload)
    if (parsed.isErr()) {
      logError('Rejected login request', parsed.error, { command: 'user.login', payload })
      acknowledged = true
      acknowledge({ outcome: parsed.error })
      return
    }
    const { username } = parsed.value

    if (socket.data.user) {
      acknowledged = true
      acknowledge(
        socket.data.user.username === username
          ? { outcome: 'LOGGED_IN', user: socket.data.user }
          : { outcome: 'ALREADY_LOGGED_IN' },
      )
      return
    }

    const user = users.findOrCreate(username)
    socket.data.user = user
    acknowledged = true
    acknowledge({ outcome: 'LOGGED_IN', user })
  } catch (error) {
    logError('Failed to process login', error, { command: 'user.login', payload })
    if (!acknowledged) acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
}
