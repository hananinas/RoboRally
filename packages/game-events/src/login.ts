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

export class LoginRequestError extends Error {
  constructor(readonly outcome: LoginRequestRejection) {
    super(outcome)
    this.name = 'LoginRequestError'
  }
}

export function parseLogin(payload: unknown): Login {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => key !== 'username')
  ) {
    throw new LoginRequestError('INVALID_REQUEST')
  }

  const result = loginSchema.safeParse(payload)
  if (!result.success) throw new LoginRequestError('INVALID_USERNAME')
  return result.data
}
