import { z } from 'zod'
import type { GameInitialization, User } from './payloads.js'

export const emptyRequestSchema = z.strictObject({}).readonly()
export const lobbyRequestSchema = z.strictObject({ lobbyId: z.uuid() }).readonly()
export const BOARD_MAP_NAMES = ['empty-map', 'test-map'] as const
export const boardMapNameSchema = z.enum(BOARD_MAP_NAMES)
export const createLobbyRequestSchema = z.strictObject({
  mapName: boardMapNameSchema.optional(),
}).readonly()
export type EmptyRequest = z.infer<typeof emptyRequestSchema>
export type LobbyRequest = z.infer<typeof lobbyRequestSchema>
export type BoardMapName = typeof BOARD_MAP_NAMES[number]
export type CreateLobbyRequest = z.infer<typeof createLobbyRequestSchema>

export type LobbySummary = Readonly<{
  lobbyId: string
  name: string
  mapName: BoardMapName
  mapIcon: string
  playerCount: number
  maxPlayers: number
}>
export type LobbyState = LobbySummary & Readonly<{ ownerUserId: string; players: readonly User[] }>
export type LobbyFailure = Readonly<{
  outcome: 'INVALID_REQUEST' | 'INTERNAL_ERROR'
    | 'LOBBY_NOT_FOUND' | 'NOT_LOBBY_MEMBER' | 'NOT_LOBBY_OWNER'
    | 'LOBBY_FULL' | 'USER_ALREADY_IN_SESSION'
}>
export type LobbyListResult = Readonly<{ outcome: 'LOBBIES_FOUND'; lobbies: readonly LobbySummary[] }> | LobbyFailure
export type LobbyJoinResult = Readonly<{ outcome: 'LOBBY_JOINED'; lobby: LobbyState }> | LobbyFailure
export type LobbyLeaveResult = Readonly<{ outcome: 'LEFT' }> | LobbyFailure
export type LobbyStartResult =
  | Readonly<{ outcome: 'STARTED'; gameId: string }>
  | Readonly<{ outcome: 'LOBBY_MEMBER_DISCONNECTED' }>
  | LobbyFailure
export type SessionResult =
  | Readonly<{ outcome: 'NO_SESSION'; user: User }>
  | Readonly<{ outcome: 'IN_LOBBY'; lobby: LobbyState; user: User }>
  | Readonly<{ outcome: 'IN_GAME'; initialization: GameInitialization; user: User }>
  | LobbyFailure
