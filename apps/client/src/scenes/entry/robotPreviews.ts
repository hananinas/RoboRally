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
  layers: Array.from({ length: 5 }, (_, index) => {
    const inset = index * 7
    return `<rect x="${inset}" y="${inset}" width="${100 - inset * 2}" height="${100 - inset * 2}" rx="7" fill="color-mix(in srgb, var(--robot-colour) ${65 + index * 8}%, var(--entry-side))" />`
  }),
}

export const tankPreview: RobotPreviewDefinition = {
  viewBox: '0 0 57 87',
  previewSize: 175,
  // Reuse the existing asset's symbol contents without injecting shared IDs.
  layers: Array.from(tankSprites.matchAll(/<symbol\b[^>]*>([\s\S]*?)<\/symbol>/g), (match) => match[1]),
}
