import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import tankSprites from '../active-game/board/assets/tanks.hbls?raw'
import forkClampSprites from '../active-game/board/assets/fork-clamp.hbls?raw'
import RobotPreview from './RobotPreview.tsx'
import { robotOptions, tankPreview, type RobotPreviewDefinition } from './robotPreviews.ts'

describe('RobotPreview', () => {
  it.each([2, 8])('renders a supplied %i-layer sprite without a model-specific branch', (count) => {
    const sprite: RobotPreviewDefinition = {
      viewBox: '0 0 120 80',
      previewSize: 160,
      layers: Array.from({ length: count }, (_, index) => `<circle cx="${index + 1}" cy="20" r="10" />`),
    }
    const markup = renderToStaticMarkup(<RobotPreview sprite={sprite} />)

    expect(markup.match(/<svg /g)).toHaveLength(count)
    expect(markup.match(/viewBox="0 0 120 80"/g)).toHaveLength(count)
    expect(markup).toContain(`--layer:${count - 1}`)
    expect(markup).toContain(`<circle cx="${count}"`)
    expect(markup).toContain('--robot-preview-size:160px')
  })

  it('uses every tank layer without duplicating its symbol IDs', () => {
    expect(tankPreview.layers).toHaveLength((tankSprites.match(/<symbol\b/g) ?? []).length)
    expect(tankPreview.layers.length).toBeGreaterThan(0)
    const markup = renderToStaticMarkup(<><RobotPreview sprite={tankPreview} /><RobotPreview sprite={tankPreview} /></>)

    expect(markup).not.toContain('<symbol')
    expect(markup).not.toContain('id="testTank')
    expect(markup).not.toContain('<use')
    expect(markup).toContain('<rect')
  })

  it('provides one layered preview for each robot asset file', () => {
    expect(robotOptions.map(({ id }) => id)).toEqual(['tank', 'fork-clamp'])
    expect(robotOptions[0]?.sprite.layers).toHaveLength((tankSprites.match(/<symbol\b/g) ?? []).length)
    expect(robotOptions[1]?.sprite.layers).toHaveLength((forkClampSprites.match(/<symbol\b/g) ?? []).length)
    for (const option of robotOptions) {
      expect(option.sprite.layers.every((layer) => layer.length > 0)).toBe(true)
    }
  })
})
