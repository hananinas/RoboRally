export function logError(message: string, error: unknown, context: Record<string, unknown> = {}): void {
  console.error(message, { ...context, error })
}
