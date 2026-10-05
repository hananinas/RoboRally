import { z } from 'zod'
import type { JoinGame } from './payloads.js'

export const joinGameSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()

export function parseJoinGame(payload: unknown): JoinGame {
  return joinGameSchema.parse(payload)
}