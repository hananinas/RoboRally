import { err, ok, type Result } from 'neverthrow'
import type { RobotSpriteId, User } from '@robo-rally/game-events'
import { Lobby, type LobbyMember } from '@/domain/lobby/Lobby'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'
import { presentLobby } from '@/socket/presenters/lobbyPresenter'

export type ConnectedLobbyMember = {
  user: User
  connectionId: string
  robotSpriteId: RobotSpriteId
  colorIndex?: number
  socket: GameSocket
}

export class LobbySession {
  readonly lobby: Lobby
  readonly room: string

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

  private connect(socket: GameSocket): void {
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
    this.disconnect(socket)
    this.lobby.removeMember(socket.data.user.userId)
    if (this.lobby.size > 0) {
      socket.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
    }
  }

  resolveConnectedMembers(io: GameSocketServer): Result<ConnectedLobbyMember[], 'LOBBY_MEMBER_DISCONNECTED'> {
    const members: ConnectedLobbyMember[] = []
    for (const member of this.lobby.members) {
      const socket = io.sockets.sockets.get(member.connectionId)
      if (!socket?.connected) return err('LOBBY_MEMBER_DISCONNECTED')
      members.push({ ...member, socket })
    }
    return ok(members)
  }
}
