import type { RobotSpriteId } from '@robo-rally/game-events'
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

export const forkClampPreviews = Array.from(
  forkClampSprites.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["'][^>]*viewBox=["']([^"']+)["'][^>]*>([\s\S]*?)<\/symbol>/g),
  (match) => ({
    id: match[1]!,
    name: `Fork Clamp ${match[1]!.match(/(\d+)$/)?.[1] ?? 'Design'}`,
    sprite: { viewBox: match[2]!, previewSize: 150, layers: [match[3]!] },
  }),
)

export const robotOptions = forkClampPreviews.map((option) => ({
  ...option,
  color: '#4d8deb',
})) as readonly { id: RobotSpriteId; name: string; sprite: RobotPreviewDefinition; color: string }[]

export const tankPreview = forkClampPreviews[0]?.sprite ?? placeholderPreview

export function robotOptionFor(id: RobotSpriteId) {
  return robotOptions.find((option) => option.id === id) ?? {
    id,
    name: 'Robot',
    sprite: placeholderPreview,
    color: '#4d8deb',
  }
}
