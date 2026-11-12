import { ROBOT_SPRITE_IDS, type RobotSpriteId } from '@robo-rally/game-events'
import tankSprites from '../active-game/board/assets/tanks.hbls?raw'

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

export const tankPreview: RobotPreviewDefinition = {
  viewBox: '0 0 57 87',
  previewSize: 175,
  // Reuse the existing asset's symbol contents without injecting shared IDs.
  layers: Array.from(tankSprites.matchAll(/<symbol\b[^>]*>([\s\S]*?)<\/symbol>/g), (match) => match[1]),
}

const placeholderShapes = [
  '<path d="M50 8 88 30v40L50 92 12 70V30z" fill="var(--robot-colour)"/><path d="M31 38h38v25H31z" fill="var(--entry-side)"/><circle cx="50" cy="50" r="11" fill="var(--entry-accent)"/>',
  '<path d="M50 6 90 50 50 94 10 50z" fill="var(--robot-colour)"/><path d="m50 23 24 27-24 27-24-27z" fill="var(--entry-side)"/><path d="M50 35 64 50 50 65 36 50z" fill="var(--entry-accent)"/>',
  '<rect x="14" y="24" width="72" height="52" rx="22" fill="var(--robot-colour)"/><circle cx="28" cy="77" r="9" fill="var(--entry-side)"/><circle cx="72" cy="77" r="9" fill="var(--entry-side)"/><path d="M50 32 68 50 50 68 32 50z" fill="var(--entry-accent)"/>',
  '<path d="M20 20h60v60H20z" fill="var(--robot-colour)"/><path d="M32 32h36v36H32z" fill="var(--entry-side)"/><path d="M50 20v60M20 50h60" stroke="var(--entry-accent)" stroke-width="8"/>',
  '<path d="M50 7 82 25v38L50 92 18 74V36z" fill="var(--robot-colour)"/><path d="M50 22 69 33v24L50 68 31 57V33z" fill="var(--entry-side)"/><path d="m50 33 12 17-12 17-12-17z" fill="var(--entry-accent)"/>',
  '<path d="M15 35 50 12l35 23v39L50 88 15 74z" fill="var(--robot-colour)"/><path d="M29 40h42v23H29z" fill="var(--entry-side)"/><circle cx="50" cy="51" r="8" fill="var(--entry-accent)"/><path d="M23 76h54" stroke="var(--entry-side)" stroke-width="7"/>',
] as const

const placeholderColors = ['#4d8deb', '#e55f5f', '#4caf70', '#a67de0', '#db79a8', '#e0bb1f'] as const

const placeholderNames = ['Scout', 'Guardian', 'Rover', 'Striker', 'Sentinel', 'Hauler'] as const

export const robotOptions = [
  { id: ROBOT_SPRITE_IDS[0], name: 'Tank', sprite: tankPreview, color: '#4d8deb' },
  ...placeholderShapes.map((shape, index) => ({
    id: ROBOT_SPRITE_IDS[index + 1]!,
    name: placeholderNames[index]!,
    sprite: { viewBox: '0 0 100 100', previewSize: 150, layers: [shape] },
    color: placeholderColors[index]!,
  })),
] as const satisfies readonly { id: RobotSpriteId; name: string; sprite: RobotPreviewDefinition; color: string }[]

export function robotOptionFor(id: RobotSpriteId) {
  return robotOptions.find((option) => option.id === id) ?? robotOptions[0]!
}
