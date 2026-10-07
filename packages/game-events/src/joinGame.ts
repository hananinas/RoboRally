import { z } from 'zod'

export const joinGameSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()
