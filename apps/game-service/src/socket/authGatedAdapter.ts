import { SessionAwareAdapter, type BroadcastOptions } from 'socket.io-adapter'
import type { SessionStore } from '@/auth/sessionStore'
import type { GameSocket } from '@/socket/gameServer'

export function createAuthGatedAdapter(sessionStore: SessionStore) {
  return class AuthGatedAdapter extends SessionAwareAdapter {
    override broadcast(packet: unknown, opts: BroadcastOptions): void {
      const sockets = this.nsp.sockets as Map<string, GameSocket>
      const except = new Set(opts.except)
      for (const [id, socket] of sockets) {
        if (except.has(id) || sessionStore.get(socket.data.sessionId)) continue
        except.add(id)
        socket.disconnect(true)
      }
      super.broadcast(packet, { ...opts, except })
    }
  }
}
