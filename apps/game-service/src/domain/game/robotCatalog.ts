import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RobotDefinition } from '@robo-rally/game-events'

const ROBOT_ASSETS = [
  { id: 'tank', name: 'Tank', fileName: 'tanks.hbls' },
  { id: 'fork-clamp', name: 'Fork Clamp', fileName: 'fork-clamp.hbls' },
] as const

function robotAssetDirectory(): string {
  const candidates = [
    resolve(process.cwd(), 'apps/client/src/scenes/active-game/board/assets'),
    resolve(process.cwd(), '../client/src/scenes/active-game/board/assets'),
    resolve(import.meta.dirname, '../../../../client/src/scenes/active-game/board/assets'),
  ]
  const directory = candidates.find((candidate) =>
    ROBOT_ASSETS.every(({ fileName }) => {
      try {
        readFileSync(resolve(candidate, fileName), 'utf8')
        return true
      } catch {
        return false
      }
    }),
  )
  if (!directory) throw new Error('Unable to locate the tank and fork-clamp robot assets')
  return directory
}

const assetDirectory = robotAssetDirectory()

export const robotCatalog = ROBOT_ASSETS.map(({ id, name, fileName }, index) => {
  const source = readFileSync(resolve(assetDirectory, fileName), 'utf8')
  const symbolCount = Array.from(source.matchAll(/<symbol\b[^>]*\bid=["'][^"']+["'][^>]*>/g)).length
  if (symbolCount === 0) throw new Error(`Robot asset ${fileName} contains no SVG symbols`)
  return {
    id,
    name,
    icon: '',
    defaultForLobbyCreation: index === 0,
  }
}) satisfies readonly RobotDefinition[]

const robotsById = new Map<string, RobotDefinition>(
  robotCatalog.map((robot): [string, RobotDefinition] => [robot.id, robot]),
)

export const DEFAULT_ROBOT_ID = robotCatalog[0]!.id

export function findRobotDefinition(id: string): RobotDefinition | undefined {
  return robotsById.get(id)
}
