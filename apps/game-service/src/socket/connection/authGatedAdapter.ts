import { SessionAwareAdapter, type BroadcastOptions } from 'socket.io-adapter'
import type { SessionStore } from '@/auth/sessionStore'
import type { GameSocket, GameSocketData } from '@/socket/gameServer'
import { MembershipRegistry } from '@/membership/MembershipRegistry'
import { recoveryError } from '@/socket/connection/socketConnection'

export function createAuthGatedAdapter(sessionStore: SessionStore, registry = new MembershipRegistry()) {
  return class AuthGatedAdapter extends SessionAwareAdapter {
    override async restoreSession(pid: string, offset: string) {
      const session = await super.restoreSession(pid, offset)
      if (session) {
        const { user } = session.data as GameSocketData
        // Socket.IO replays these packets before middleware can reject stale rooms.
        if (recoveryError(registry, user.userId, session.sid, session.rooms)) {
          return { ...session, missedPackets: [] }
        }
      }
      return session
    }

    override broadcast(packet: unknown, opts: BroadcastOptions): void {
      const sockets = this.nsp.sockets as Map<string, GameSocket>
      const except = new Set(opts.except)
      const expiredSockets: GameSocket[] = []
      for (const [id, socket] of sockets) {
        if (except.has(id) || sessionStore.get(socket.data.sessionId)) continue
        except.add(id)
        expiredSockets.push(socket)
      }
      super.broadcast(packet, { ...opts, except })
      for (const socket of expiredSockets) socket.disconnect(true)
    }
  }
}
