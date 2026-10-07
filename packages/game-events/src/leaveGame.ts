import { z } from 'zod'
import type { JoinGame } from './payloads.js'

export const leaveGameSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()

export function parseLeaveGame(payload: unknown): JoinGame {
  return leaveGameSchema.parse(payload)
}
