import type { BoardMapSummary, LobbyState, LobbySummary } from '@robo-rally/game-events'
import { boardMaps } from '@/domain/game/boardMaps'
import { robotCatalog } from '@/domain/game/robotCatalog'
import { Lobby } from '@/domain/lobby/Lobby'

export function presentBoardMaps(): readonly BoardMapSummary[] {
  return Object.entries(boardMaps).map(([mapName, map]) => ({
    mapName,
    name: map.name,
    icon: map.icon,
  }))
}

export function presentLobbySummary(lobby: Lobby): LobbySummary {
  const map = boardMaps[lobby.mapName]
  return {
    lobbyId: lobby.lobbyId, name: lobby.name, mapName: lobby.mapName, mapDisplayName: map.name, mapIcon: map.icon,
    playerCount: lobby.size, maxPlayers: lobby.maxPlayers,
  }
}

export function presentLobby(lobby: Lobby): LobbyState {
  return {
    ...presentLobbySummary(lobby),
    ownerUserId: lobby.ownerUserId,
    players: lobby.members.map(({ user, robotSpriteId }) => ({
      userId: user.userId, username: user.username, robotSpriteId,
    })),
    robots: robotCatalog,
  }
}
