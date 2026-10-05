import { z } from 'zod'

export const createLobbySchema = z
  .strictObject({
    name: z.string().trim().min(1).max(32),
    code: z.string().regex(/^\d{4}$/),
    map: z.enum(['Map 1', 'Map 2']),
  })
  .readonly()

export const joinLobbySchema = z
  .strictObject({ code: z.string().regex(/^\d{4}$/) })
  .readonly()

export type CreateLobby = z.infer<typeof createLobbySchema>
export type JoinLobby = z.infer<typeof joinLobbySchema>

export class LobbyRequestError extends Error {
  constructor() {
    super('INVALID_REQUEST')
    this.name = 'LobbyRequestError'
  }
}

export function parseCreateLobby(payload: unknown): CreateLobby {
  const result = createLobbySchema.safeParse(payload)
  if (!result.success) throw new LobbyRequestError()
  return result.data
}

export function parseJoinLobby(payload: unknown): JoinLobby {
  const result = joinLobbySchema.safeParse(payload)
  if (!result.success) throw new LobbyRequestError()
  return result.data
}