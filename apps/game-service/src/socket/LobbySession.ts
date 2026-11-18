import { err, ok, type Result } from 'neverthrow'
import { Lobby, type LobbyMember } from '@/domain/lobby/Lobby'
import type { GameSocket } from '@/socket/gameServer'
import { presentLobby } from '@/socket/presenters/lobbyPresenter'

export class LobbySession {
  readonly lobby: Lobby
  readonly room: string

  constructor(lobby: Lobby) {
    this.lobby = lobby
    this.room = `lobby:${lobby.lobbyId}`
  }

  isMember(socket: GameSocket): Result<LobbyMember, 'NOT_A_MEMBER'> {
    const member = this.lobby.getMember(socket.data.user.userId)
    return member?.connectionId === socket.id ? ok(member) : err('NOT_A_MEMBER')
  }

  connect(socket: GameSocket): void {
    void socket.join(this.room)
  }

  disconnect(socket: GameSocket): void {
    void socket.leave(this.room)
  }

  join(socket: GameSocket): void {
    this.lobby.addMember(socket.data.user, socket.id)
    this.connect(socket)
    socket.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
  }

  leave(socket: GameSocket): void {
    this.lobby.removeMember(socket.data.user.userId)
    this.disconnect(socket)
    if (this.lobby.size > 0) {
      socket.to(this.room).emit('lobby.updated', { lobby: presentLobby(this.lobby) })
    }
  }
}
