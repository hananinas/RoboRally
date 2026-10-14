import { z } from 'zod'

export const getLobbyDetailsSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()