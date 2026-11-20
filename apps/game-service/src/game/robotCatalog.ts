import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RobotDefinition } from '@robo-rally/game-events'

function forkClampAssetIds(): string[] {
  const candidates = [
    resolve(process.cwd(), 'apps/client/src/scenes/active-game/board/assets/fork-clamp.hbls'),
    resolve(process.cwd(), '../client/src/scenes/active-game/board/assets/fork-clamp.hbls'),
    resolve(__dirname, '../../../client/src/scenes/active-game/board/assets/fork-clamp.hbls'),
  ]
  for (const candidate of candidates) {
    try {
      const source = readFileSync(candidate, 'utf8')
      const ids = Array.from(source.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["'][^>]*>/g), (match) => match[1])
      if (ids.length > 0) return ids
    } catch {
      // Try the next local/build source location.
    }
  }
  return Array.from({ length: 8 }, (_, index) => `fork-clamp${index + 1}`)
}

const catalogIds = forkClampAssetIds()

export const robotCatalog = catalogIds.map((id, index) => ({
  id,
  name: `Fork Clamp ${index + 1}`,
  icon: '',
  defaultForLobbyCreation: index === 0,
})) satisfies readonly RobotDefinition[]

const robotsById = new Map<string, RobotDefinition>(
  robotCatalog.map((robot): [string, RobotDefinition] => [robot.id, robot]),
)
const defaultRobot = robotCatalog.find((robot) => robot.defaultForLobbyCreation)

if (!defaultRobot) throw new Error('No default robot is configured for lobby creation')

export const DEFAULT_ROBOT_ID = defaultRobot.id

export function findRobotDefinition(id: string): RobotDefinition | undefined {
  return robotsById.get(id)
}
