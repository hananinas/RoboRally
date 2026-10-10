import { z } from 'zod'

export const getPublicGameStateSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()
