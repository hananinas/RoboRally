import { err, ok, type Result } from 'neverthrow'
import { z } from 'zod'

export const loginSchema = z
  .strictObject({
    username: z.string().refine((username) => {
      const length = Array.from(username).length
      return length >= 1 && length <= 30
    }),
  })
  .readonly()

export type Login = z.infer<typeof loginSchema>
export type LoginRequestRejection = 'INVALID_REQUEST' | 'INVALID_USERNAME'

export function parseLogin(payload: unknown): Result<Login, LoginRequestRejection> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => key !== 'username')
  ) {
    return err('INVALID_REQUEST')
  }

  const result = loginSchema.safeParse(payload)
  if (!result.success) return err('INVALID_USERNAME')
  return ok(result.data)
}
