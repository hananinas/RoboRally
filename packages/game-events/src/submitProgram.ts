import { z } from 'zod'

const cardIdSchema = z.uuid()

const programCardIdsSchema = z
  .tuple([
    cardIdSchema,
    cardIdSchema,
    cardIdSchema,
    cardIdSchema,
    cardIdSchema,
  ])
  .refine((cardIds) => new Set(cardIds).size === cardIds.length, {
    message: 'Card IDs must be unique',
  })
  .readonly()

export const submitProgramSchema = z
  .strictObject({
    gameId: z.uuid(),
    playerId: z.uuid(),
    cardIds: programCardIdsSchema,
  })
  .readonly()

export type ProgramCardIds = z.infer<typeof programCardIdsSchema>
export type SubmitProgram = z.infer<typeof submitProgramSchema>

export function parseSubmitProgram(payload: unknown): SubmitProgram {
  return submitProgramSchema.parse(payload)
}
