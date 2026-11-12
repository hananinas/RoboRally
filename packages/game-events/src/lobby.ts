import { z } from 'zod'
import type { GameInitialization, User } from './payloads.js'

export const emptyRequestSchema = z.strictObject({}).readonly()
export const ROBOT_SPRITE_IDS = ['tank', 'scout', 'guardian', 'rover', 'striker', 'sentinel', 'hauler'] as const
export const lobbyRequestSchema = z.strictObject({
  lobbyId: z.uuid(),
  robotSpriteId: z.enum(ROBOT_SPRITE_IDS).optional(),
}).readonly()
export const robotSelectionRequestSchema = z.strictObject({
  robotSpriteId: z.enum(ROBOT_SPRITE_IDS),
}).readonly()
export const createLobbyRequestSchema = z.strictObject({
  mapName: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(50).optional(),
  robotSpriteId: z.enum(ROBOT_SPRITE_IDS).optional(),
}).readonly()
export type EmptyRequest = z.infer<typeof emptyRequestSchema>
export type LobbyRequest = z.infer<typeof lobbyRequestSchema>
export type RobotSpriteId = typeof ROBOT_SPRITE_IDS[number]
export type RobotSelectionRequest = z.infer<typeof robotSelectionRequestSchema>
export type BoardMapName = string
export type CreateLobbyRequest = z.infer<typeof createLobbyRequestSchema>

export type BoardMapSummary = Readonly<{
  mapName: BoardMapName
  name: string
  icon: string
  defaultForLobbyCreation: boolean
}>
export type LobbySummary = Readonly<{
  lobbyId: string
  name: string
  mapName: BoardMapName
  mapDisplayName: string
  mapIcon: string
  playerCount: number
  maxPlayers: number
}>
export type LobbyPlayer = User & Readonly<{ robotSpriteId: RobotSpriteId }>
export type LobbyState = LobbySummary & Readonly<{ ownerUserId: string; players: readonly LobbyPlayer[] }>
export type LobbyFailure = Readonly<{
  outcome: 'INVALID_REQUEST' | 'INTERNAL_ERROR'
    | 'LOBBY_NOT_FOUND' | 'NOT_LOBBY_MEMBER' | 'NOT_LOBBY_OWNER'
    | 'LOBBY_FULL' | 'USER_ALREADY_IN_SESSION'
}>
export type LobbyListResult = Readonly<{
  outcome: 'LOBBIES_FOUND'
  lobbies: readonly LobbySummary[]
  maps: readonly BoardMapSummary[]
}> | LobbyFailure
export type LobbyJoinResult = Readonly<{ outcome: 'LOBBY_JOINED'; lobby: LobbyState }> | LobbyFailure
export type LobbyLeaveResult = Readonly<{ outcome: 'LEFT' }> | LobbyFailure
export type RobotSelectionResult = Readonly<{ outcome: 'ROBOT_SELECTED'; lobby: LobbyState }> | LobbyFailure
export type LobbyStartResult =
  | Readonly<{ outcome: 'STARTED'; gameId: string }>
  | Readonly<{ outcome: 'LOBBY_MEMBER_DISCONNECTED' }>
  | LobbyFailure
export type SessionResult =
  | Readonly<{ outcome: 'NO_SESSION'; user: User }>
  | Readonly<{ outcome: 'IN_LOBBY'; lobby: LobbyState; user: User }>
  | Readonly<{ outcome: 'IN_GAME'; initialization: GameInitialization; user: User }>
  | LobbyFailure
