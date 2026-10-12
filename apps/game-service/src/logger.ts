import pino from 'pino'

const logger = pino()

export function logError(message: string, error: unknown, context: Record<string, unknown> = {}): void {
  logger.error({ ...context, error }, message)
}

export function logWarn(message: string, context: Record<string, unknown> = {}): void {
  logger.warn(context, message)
}
