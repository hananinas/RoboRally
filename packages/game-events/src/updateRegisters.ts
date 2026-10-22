import { z } from 'zod'

const registerOccupancySchema = z
  .tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()])
  .readonly()

export const updateRegistersSchema = z
  .strictObject({
    gameId: z.uuid(),
    playerId: z.uuid(),
    occupied: registerOccupancySchema,
  })
  .readonly()

export type RegisterOccupancy = z.infer<typeof registerOccupancySchema>
export type UpdateRegisters = z.infer<typeof updateRegistersSchema>
