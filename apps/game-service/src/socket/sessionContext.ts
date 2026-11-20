import type { RobotSpriteId, User } from '@robo-rally/game-events'
import type { BoardMapName } from '@/game/boardMaps'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'
import type { MembershipContext } from '@/socket/handlers/membershipHandlers'

export type Lobby = {
  lobbyId: string
  name: string
  mapName: BoardMapName
  members: Map<string, { user: User; connectionId: string; robotSpriteId: RobotSpriteId }>
}

type UserSession = { kind: 'lobby'; lobbyId: string } | { kind: 'game'; gameId: string }

export type SessionContext = {
  io: GameSocketServer
  games: Map<string, MembershipContext>
  lobbies: Map<string, Lobby>
  sessionsByUser: Map<string, UserSession>
}

export function currentGame(context: SessionContext, socket: GameSocket): MembershipContext | undefined {
  const session = context.sessionsByUser.get(socket.data.user.userId)
  return session?.kind === 'game' ? context.games.get(session.gameId) : undefined
}
