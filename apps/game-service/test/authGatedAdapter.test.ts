import { SessionAwareAdapter, type BroadcastOptions } from 'socket.io-adapter'
import { describe, expect, it, vi } from 'vitest'
import { createAuthGatedAdapter } from '@/socket/authGatedAdapter'
import type { SessionStore } from '@/auth/sessionStore'
import type { GameSocket } from '@/socket/gameServer'

type Nsp = ConstructorParameters<typeof SessionAwareAdapter>[0]

describe('AuthGatedAdapter', () => {
  it('does not let disconnecting an expired socket run its side effects before the broadcast is sent', () => {
    const order: string[] = []
    vi.spyOn(SessionAwareAdapter.prototype, 'broadcast').mockImplementation(() => { order.push('broadcast') })
    const disconnect = vi.fn(() => order.push('disconnect'))
    const expiredSocket = {
      id: 'expired',
      data: { sessionId: 'gone' },
      disconnect,
    } as unknown as GameSocket
    const nsp = {
      sockets: new Map([['expired', expiredSocket]]),
      server: { encoder: {}, opts: { connectionStateRecovery: { maxDisconnectionDuration: 0 } } },
    } as unknown as Nsp
    const sessionStore: SessionStore = { create: () => '', get: () => undefined, destroy: () => {} }
    const Adapter = createAuthGatedAdapter(sessionStore)
    const adapter = new Adapter(nsp)

    adapter.broadcast({}, { rooms: new Set(), except: new Set() } as BroadcastOptions)

    expect(order).toEqual(['broadcast', 'disconnect'])
    expect(disconnect).toHaveBeenCalledWith(true)
  })
})
