import { z } from 'zod'

export const emptyRequestSchema = z.strictObject({}).readonly()
export const lobbyRequestSchema = z.strictObject({ lobbyId: z.uuid() }).readonly()

export type EmptyRequest = z.infer<typeof emptyRequestSchema>
export type LobbyRequest = z.infer<typeof lobbyRequestSchema>
