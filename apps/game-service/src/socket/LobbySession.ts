import { err, ok, type Result } from 'neverthrow'
import type { User } from '@robo-rally/game-events'
import { Lobby, type LobbyMember } from '@/domain/lobby/Lobby'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'
import { presentLobby } from '@/socket/presenters/lobbyPresenter'
import { Seats } from '@/socket/seats'

/** A roster entry resolved to a live socket, for seating the lobby into a game. */
export type ConnectedLobbyMember = LobbyMember & { socket: GameSocket }

const LOBBY_RECONNECT_GRACE_MS = 10_000

export class LobbySession {
  readonly lobby: Lobby
  readonly room: string
  private readonly seats = new Seats<{ user: User }>()
  /** When to give each unbound seat up. A seat is unbound for exactly as long as a leave is pending. */
  private readonly pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>()

  static roomFor(lobbyId: string): string {
    return `lobby:${lobbyId}`
  }

  constructor(lobby: Lobby) {
    this.lobby = lobby
    this.room = LobbySession.roomFor(lobby.lobbyId)
  }

  isMember(socket: GameSocket): Result<void, 'NOT_A_MEMBER'> {
    return this.seats.activeSeat(socket.data.user.userId, socket.id).map(() => undefined)
  }

  /** Joins the room and seats the member against this connection. */
  attach(socket: GameSocket): boolean {
    if (!this.lobby.getMember(socket.data.user.userId)) return false
    void socket.join(this.room)
    this.seats.add({ user: socket.data.user, connectionId: socket.id })
    return true
  }

  join(socket: GameSocket): void {
    this.lobby.addMember(socket.data.user)
    this.attach(socket)
    socket.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
  }

  /**
   * Notes that this user's connection is gone. Unlike a game, which waits indefinitely for a
   * player to come back, a lobby gives the seat up once the grace period elapses.
   */
  markDisconnected(socket: GameSocket, onExpiry: () => void): void {
    const { userId } = socket.data.user
    if (this.isMember(socket).isErr()) return
    this.seats.unbind(userId)
    this.pendingLeaves.set(userId, setTimeout(onExpiry, LOBBY_RECONNECT_GRACE_MS).unref())
  }

  reattach(socket: GameSocket): Result<void, 'ALREADY_HAS_MEMBERSHIP' | 'INTERNAL_ERROR'> {
    const { userId } = socket.data.user
    const bound = this.seats.bind(userId, socket.id)
    if (bound.isErr()) return err(bound.error)
    if (bound.value.reconnected) {
      void socket.join(this.room)
      this.cancelPendingLeave(userId)
    }
    return ok(undefined)
  }

  /** Gives a seat up by user id, so an expired leave needs no socket of its own. */
  releaseSeat(userId: string, io: GameSocketServer): void {
    this.cancelPendingLeave(userId)
    this.seats.remove(userId)
    this.lobby.removeMember(userId)
    if (this.lobby.size > 0) {
      io.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
    }
  }

  leave(socket: GameSocket, io: GameSocketServer): void {
    // Out of the room first, so the roster update does not reach the member who is leaving.
    this.leaveRoom(socket)
    this.releaseSeat(socket.data.user.userId, io)
  }

  /** Removes the socket from the lobby room. Does not close the connection. */
  leaveRoom(socket: GameSocket): void {
    void socket.leave(this.room)
  }

  resolveConnectedMembers(io: GameSocketServer): Result<ConnectedLobbyMember[], 'LOBBY_MEMBER_DISCONNECTED'> {
    const members: ConnectedLobbyMember[] = []
    // Iterating the roster, not the seats: this order decides who gets which start tile.
    for (const member of this.lobby.members) {
      const connectionId = this.seats.get(member.user.userId)?.connectionId
      if (!connectionId) return err('LOBBY_MEMBER_DISCONNECTED')
      const socket = io.sockets.sockets.get(connectionId)
      if (!socket?.connected) return err('LOBBY_MEMBER_DISCONNECTED')
      members.push({ ...member, socket })
    }
    return ok(members)
  }

  private cancelPendingLeave(userId: string): void {
    clearTimeout(this.pendingLeaves.get(userId))
    this.pendingLeaves.delete(userId)
  }
}
