import { err, ok, type Result } from 'neverthrow'
import type { RobotSpriteId, User } from '@robo-rally/game-events'
import { Lobby, type LobbyMember } from '@/domain/lobby/Lobby'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'
import { presentLobby } from '@/socket/presenters/lobbyPresenter'

export type ConnectedLobbyMember = {
  user: User
  connectionId: string
  robotSpriteId: RobotSpriteId
  socket: GameSocket
}

const LOBBY_RECONNECT_GRACE_MS = 10_000

export class LobbySession {
  readonly lobby: Lobby
  readonly room: string
  private readonly pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>()

  static roomFor(lobbyId: string): string {
    return `lobby:${lobbyId}`
  }

  constructor(lobby: Lobby) {
    this.lobby = lobby
    this.room = LobbySession.roomFor(lobby.lobbyId)
  }

  isMember(socket: GameSocket): Result<LobbyMember, 'NOT_A_MEMBER'> {
    const member = this.lobby.getMember(socket.data.user.userId)
    return member?.connectionId === socket.id ? ok(member) : err('NOT_A_MEMBER')
  }

  deferLeave(socket: GameSocket, onExpiry: () => void): void {
    const { userId } = socket.data.user
    if (this.isMember(socket).isErr() || this.pendingLeaves.has(userId)) return
    this.pendingLeaves.set(userId, setTimeout(onExpiry, LOBBY_RECONNECT_GRACE_MS).unref())
  }

  reattach(socket: GameSocket): boolean {
    const { userId } = socket.data.user
    const member = this.lobby.getMember(userId)
    if (!member) return false
    if (!this.pendingLeaves.has(userId)) return member.connectionId === socket.id
    this.connect(socket)
    member.connectionId = socket.id
    this.cancelPendingLeave(userId)
    return true
  }

  private cancelPendingLeave(userId: string): void {
    clearTimeout(this.pendingLeaves.get(userId))
    this.pendingLeaves.delete(userId)
  }

  connect(socket: GameSocket): void {
    void socket.join(this.room)
  }

  disconnect(socket: GameSocket): void {
    void socket.leave(this.room)
  }

  join(socket: GameSocket): void {
    this.connect(socket)
    this.lobby.addMember(socket.data.user, socket.id)
    socket.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
  }

  leave(socket: GameSocket): void {
    this.cancelPendingLeave(socket.data.user.userId)
    this.disconnect(socket)
    this.lobby.removeMember(socket.data.user.userId)
    if (this.lobby.size > 0) {
      socket.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
    }
  }

  resolveConnectedMembers(io: GameSocketServer): Result<ConnectedLobbyMember[], 'LOBBY_MEMBER_DISCONNECTED'> {
    if (this.pendingLeaves.size > 0) return err('LOBBY_MEMBER_DISCONNECTED')
    const members: ConnectedLobbyMember[] = []
    for (const member of this.lobby.members) {
      const socket = io.sockets.sockets.get(member.connectionId)
      if (!socket?.connected) return err('LOBBY_MEMBER_DISCONNECTED')
      members.push({ ...member, socket })
    }
    return ok(members)
  }
}
