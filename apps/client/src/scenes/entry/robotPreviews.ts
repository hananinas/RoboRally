import type { RobotSpriteId } from '@robo-rally/game-events'
import tankSprites from '../active-game/board/assets/tanks.hbls?raw'
import forkClampSprites from '../active-game/board/assets/fork-clamp.hbls?raw'

export type RobotPreviewDefinition = Readonly<{
  viewBox: string
  /** Trusted, local SVG shapes in bottom-to-top order. */
  layers: readonly string[]
  /** Display size in the large picker; compact previews use their own size. */
  previewSize: number
}>

export const placeholderPreview: RobotPreviewDefinition = {
  viewBox: '0 0 100 100',
  previewSize: 112,
  layers: ['<path d="M50 4 91 28v44L50 96 9 72V28z" fill="var(--robot-colour)"/><path d="m50 17 28 16v34L50 83 22 67V33z" fill="var(--entry-side)"/><circle cx="50" cy="50" r="13" fill="var(--robot-colour)"/>'],
}

function parseRobotAsset(source: string) {
  const symbols = Array.from(
    source.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["'][^>]*viewBox=["']([^"']+)["'][^>]*>([\s\S]*?)<\/symbol>/g),
  )
  const first = symbols[0]
  if (!first) return undefined

  return {
    viewBox: first[2]!,
    layers: symbols.map((symbol) => symbol[3]!),
  }
}

const tankAsset = parseRobotAsset(tankSprites)
const forkClampAsset = parseRobotAsset(forkClampSprites)

export const robotOptions = [
  ...(tankAsset ? [{
    id: 'tank',
    name: 'Tank',
    sprite: { ...tankAsset, previewSize: 175 },
    color: '#4d8deb',
  }] : []),
  ...(forkClampAsset ? [{
    id: 'fork-clamp',
    name: 'Fork Clamp',
    sprite: { ...forkClampAsset, previewSize: 150 },
    color: '#4d8deb',
  }] : []),
] satisfies readonly { id: RobotSpriteId; name: string; sprite: RobotPreviewDefinition; color: string }[]

export const tankPreview = robotOptions.find((option) => option.id === 'tank')?.sprite ?? placeholderPreview

export function robotOptionFor(id: RobotSpriteId) {
  return robotOptions.find((option) => option.id === id) ?? {
    id,
    name: 'Robot',
    sprite: placeholderPreview,
    color: '#4d8deb',
  }
}
