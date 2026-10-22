import { PositiveInteger } from '@/numbers'

export const DEFAULT_GAME_SERVICE_PORT = 3001

export function parseGameServicePort(value: string | undefined): number {
  const port = PositiveInteger(value === undefined ? DEFAULT_GAME_SERVICE_PORT : Number(value))
  if (port > 65_535) {
    throw new RangeError('PORT must be an integer between 1 and 65535')
  }
  return port
}
