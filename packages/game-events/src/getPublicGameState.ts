import { z } from 'zod'
import type { GetPublicGameState } from './payloads.js'

export const getPublicGameStateSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()

export function parseGetPublicGameState(
  payload: unknown,
): GetPublicGameState {
  return getPublicGameStateSchema.parse(payload)
}
