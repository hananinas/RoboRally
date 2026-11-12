import { z } from 'zod'

const registerCardIdSchema = z.uuid().nullable()

const registerCardIdsSchema = z
  .tuple([
    registerCardIdSchema,
    registerCardIdSchema,
    registerCardIdSchema,
    registerCardIdSchema,
    registerCardIdSchema,
  ])
  .readonly()

export const updateRegistersSchema = z
  .strictObject({
    cardIds: registerCardIdsSchema,
  })
  .readonly()

export type RegisterCardIds = z.infer<typeof registerCardIdsSchema>
export type UpdateRegisters = z.infer<typeof updateRegistersSchema>
