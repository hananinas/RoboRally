import { z } from 'zod'
import type { GameInitialization, User } from './payloads.js'

export const emptyRequestSchema = z.strictObject({}).readonly()
export const ROBOT_SPRITE_IDS = [
  'tank', 'fork-clamp',
] as const
export const COLOR_PALETTE = [
  '#4d8deb',
  '#e55f5f',
  '#ffc107',
  '#4caf70',
  '#a67de0',
  '#db79a8',
] as const
export const lobbyRequestSchema = z.strictObject({ lobbyId: z.uuid() }).readonly()
export const robotSelectionRequestSchema = z.looseObject({
  robotSpriteId: z.string().trim().min(1),
  colorIndex: z.number().int().min(0).max(5).optional(),
}).readonly()
export const createLobbyRequestSchema = z.strictObject({
  mapName: z.string().min(1),
  name: z.string().trim().min(1).max(50).optional(),
}).readonly()
export type EmptyRequest = z.infer<typeof emptyRequestSchema>
export type LobbyRequest = z.infer<typeof lobbyRequestSchema>
export type RobotSpriteId = string
export type RobotSelectionRequest = z.infer<typeof robotSelectionRequestSchema>
export type BoardMapName = string
export type CreateLobbyRequest = z.infer<typeof createLobbyRequestSchema>

export type BoardMapSummary = Readonly<{
  mapName: BoardMapName
  name: string
  icon: string
}>
export type RobotDefinition = Readonly<{
  id: RobotSpriteId
  name: string
  icon: string
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
export type LobbyPlayer = User & Readonly<{ robotSpriteId: RobotSpriteId; colorIndex?: number }>
export type LobbyState = LobbySummary & Readonly<{
  ownerUserId: string
  players: readonly LobbyPlayer[]
  robots: readonly RobotDefinition[]
  colorPalette: readonly string[]
}>
export type LobbyFailure = Readonly<{
  outcome: 'INVALID_REQUEST' | 'INTERNAL_ERROR'
    | 'LOBBY_NOT_FOUND' | 'NOT_A_MEMBER' | 'NOT_LOBBY_OWNER'
    | 'LOBBY_FULL' | 'ALREADY_HAS_MEMBERSHIP' | 'COLOUR_TAKEN'
}>
export type LobbyListResult = Readonly<{
  outcome: 'LOBBIES_FOUND'
  lobbies: readonly LobbySummary[]
  maps: readonly BoardMapSummary[]
  robots: readonly RobotDefinition[]
  colorPalette: readonly string[]
}> | LobbyFailure
export type LobbyJoinResult = Readonly<{ outcome: 'LOBBY_JOINED'; lobby: LobbyState }> | LobbyFailure
export type LobbyLeaveResult = Readonly<{ outcome: 'LEFT' }> | LobbyFailure
export type RobotSelectionResult = Readonly<{ outcome: 'ROBOT_SELECTED' | 'COLOUR_TAKEN'; lobby: LobbyState }> | LobbyFailure
export type LobbyStartResult =
  | Readonly<{ outcome: 'STARTED'; gameId: string }>
  | Readonly<{ outcome: 'LOBBY_MEMBER_DISCONNECTED' }>
  | LobbyFailure
export type MembershipResult =
  | Readonly<{ outcome: 'NO_MEMBERSHIP'; user: User }>
  | Readonly<{ outcome: 'IN_LOBBY'; lobby: LobbyState; user: User }>
  | Readonly<{ outcome: 'IN_GAME'; initialization: GameInitialization; user: User }>
  | LobbyFailure
