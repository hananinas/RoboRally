import type { LobbyState } from '@robo-rally/game-events'
import { boardMaps } from '@/domain/game/boardMaps'
import { Lobby } from '@/domain/lobby/Lobby'

export function presentLobby(lobby: Lobby): LobbyState {
  const map = boardMaps[lobby.mapName]
  return {
    lobbyId: lobby.lobbyId, name: lobby.name, mapName: lobby.mapName, mapDisplayName: map.name, mapIcon: map.icon,
    ownerUserId: lobby.ownerUserId,
    playerCount: lobby.size, maxPlayers: Lobby.MAX_PLAYERS,
    players: lobby.members.map(({ user }) => ({ userId: user.userId, username: user.username })),
  }
}
