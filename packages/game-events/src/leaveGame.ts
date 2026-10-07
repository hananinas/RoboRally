import { z } from 'zod'

export const leaveGameSchema = z
  .strictObject({ gameId: z.uuid() })
  .readonly()
