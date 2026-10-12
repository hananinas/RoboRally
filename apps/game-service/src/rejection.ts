export type Rejection<Outcome extends string, Detail = unknown> = { outcome: Outcome; detail?: Detail }

export function toRejection<Outcome extends string>(
  error: Outcome | Rejection<Outcome>,
): Rejection<Outcome> {
  return typeof error === 'string' ? { outcome: error } : error
}
