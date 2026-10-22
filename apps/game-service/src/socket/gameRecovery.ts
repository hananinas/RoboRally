import { randomUUID } from 'node:crypto'
import type { GameSocketData, GameSocketServer } from '@/socket/gameServer'
import type { GameMembership, MembershipContext } from '@/socket/handlers/membershipHandlers'

type Recovery = {
  game?: MembershipContext
  membership?: GameMembership
  packets: unknown[][]
  rejection?: 'SESSION_EXPIRED' | 'USER_ALREADY_IN_SESSION'
}

export function authorizeGameRecovery(
  io: GameSocketServer,
  findGame: (userId: string) => MembershipContext | undefined,
): void {
  const recoveries = new WeakMap<GameSocketData, Recovery>()
  const pendingOwners = new Map<string, GameSocketData>()
  const adapter = io.of('/').adapter
  const restoreSession = adapter.restoreSession.bind(adapter)

  // Socket.IO 4.8 restores rooms and writes missed packets in its Socket
  // constructor, BEFORE namespace middleware. Defer both until authorization.
  adapter.restoreSession = async (pid, offset) => {
    const session = await restoreSession(pid, offset)
    if (!session) return session
    const data = { ...(session.data as GameSocketData) }
    const userId = data.user?.userId
    const game = userId ? findGame(userId) : undefined
    const membership = userId ? game?.memberships.get(userId) : undefined
    const recovery: Recovery = { game, membership, packets: session.missedPackets }
    if (!membership || session.rooms.some((room) => room.startsWith('lobby:'))) {
      recovery.rejection = 'SESSION_EXPIRED'
    } else if (membership.connectionId !== null || pendingOwners.has(userId!)) {
      recovery.rejection = 'USER_ALREADY_IN_SESSION'
    } else {
      const allowed = [session.sid, game!.publicRoom, game!.playerRoom(membership.player.id)]
      if (session.rooms.some((room) => !allowed.includes(room))) recovery.rejection = 'SESSION_EXPIRED'
      else pendingOwners.set(userId!, data)
    }
    recoveries.set(data, recovery)
    return {
      ...session,
      // Rejecting a duplicate recovered SID must not clean up the live owner's
      // adapter rooms or namespace entry when Socket.IO disposes the rejection.
      sid: recovery.rejection ? randomUUID() : session.sid,
      rooms: [],
      missedPackets: [],
      data,
    }
  }

  io.use((socket, next) => {
    if (!socket.recovered) return next()
    const recovery = recoveries.get(socket.data)
    const userId = socket.data.user?.userId
    const release = () => {
      if (userId && pendingOwners.get(userId) === socket.data) pendingOwners.delete(userId)
    }
    if (!recovery || recovery.rejection) {
      release()
      next(new Error(recovery?.rejection ?? 'SESSION_EXPIRED'))
      return
    }
    if (recovery.membership!.connectionId !== null) {
      release()
      next(new Error('USER_ALREADY_IN_SESSION'))
      return
    }
    socket.conn.once('close', release)
    if (socket.conn.readyState !== 'open') {
      release()
      next(new Error('SESSION_EXPIRED'))
      return
    }
    const game = recovery.game!
    void socket.join([game.publicRoom, game.playerRoom(recovery.membership!.player.id)])
    for (const packet of recovery.packets) {
      // Preserve original recovery offsets and pre-connect replay ordering;
      // emit() would append new offsets and persist duplicate replay packets.
      socket.client._packet({ type: 2, nsp: socket.nsp.name, data: packet })
    }
    next()
  })

  io.on('connection', (socket) => {
    const userId = socket.data.user?.userId
    if (userId && pendingOwners.get(userId) === socket.data) pendingOwners.delete(userId)
  })
}
