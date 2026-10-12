import {
  parseLogin,
  type Login,
  type LoginAcknowledgement,
} from '@robo-rally/game-events'
import { withAcknowledgeOnce } from '@/acknowledgeOnce'
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
  withAcknowledgeOnce(acknowledge, (ack) => {
    const parsed = parseLogin(payload)
    if (parsed.isErr()) {
      logError('Rejected login request', parsed.error, { command: 'user.login', payload })
      ack({ outcome: parsed.error })
      return
    }
    const { username } = parsed.value

    if (socket.data.user) {
      ack(
        socket.data.user.username === username
          ? { outcome: 'LOGGED_IN', user: socket.data.user }
          : { outcome: 'ALREADY_LOGGED_IN' },
      )
      return
    }

    const user = users.findOrCreate(username)
    socket.data.user = user
    ack({ outcome: 'LOGGED_IN', user })
  }, (error) => {
    logError('Failed to process login', error, { command: 'user.login', payload })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}
