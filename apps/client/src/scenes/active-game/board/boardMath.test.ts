import { describe, expect, it } from 'vitest'
import { BOARD_COMPONENTS, BOARD_CONFIG, BOARD_RECIPES } from './boardConfig.ts'
import {
  approach,
  cellAtPoint,
  holeProfile,
  liftedDepth,
  parallaxOffset,
  rippleHeight,
  screenToWorld,
  smoothstep,
  surfaceEffect,
  tileCentre,
  zoomAround,
  type Camera,
} from './boardMath.ts'
import { DEMO_BOARD } from './demoBoard.ts'

const camera: Camera = { x: 0, y: 0, zoom: 1 }

function expectClose(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 9)
}

describe('board geometry', () => {
  it('places the centre cell of an odd board at the origin', () => {
    expect(tileCentre({ x: 10, y: 7 }, DEMO_BOARD, BOARD_CONFIG)).toEqual({
      worldX: 0,
      worldY: 0,
    })
  })

  it('centres an even board between its middle cells', () => {
    const board = { columns: 4, rows: 2 }
    const upperLeft = tileCentre({ x: 1, y: 0 }, board, BOARD_CONFIG)
    const lowerRight = tileCentre({ x: 2, y: 1 }, board, BOARD_CONFIG)

    expect(upperLeft.worldX).toBe(-39)
    expect(upperLeft.worldY).toBe(-39)
    expect(lowerRight.worldX).toBe(39)
    expect(lowerRight.worldY).toBe(39)
  })

  it('uses the dominant viewport axis for parallax', () => {
    const offset = parallaxOffset(
      { worldX: 600, worldY: 400 },
      camera,
      { width: 1200, height: 800 },
      BOARD_CONFIG,
    )

    expectClose(offset.x, BOARD_CONFIG.tile * BOARD_CONFIG.parallax)
    expectClose(
      offset.y,
      (BOARD_CONFIG.tile * BOARD_CONFIG.parallax * 2) / 3,
    )
  })

  it('normalizes portrait and landscape viewports symmetrically', () => {
    const landscape = parallaxOffset(
      { worldX: 500, worldY: 300 },
      camera,
      { width: 1000, height: 600 },
      BOARD_CONFIG,
    )
    const portrait = parallaxOffset(
      { worldX: 300, worldY: 500 },
      camera,
      { width: 600, height: 1000 },
      BOARD_CONFIG,
    )

    expectClose(landscape.x, portrait.y)
    expectClose(landscape.y, portrait.x)
  })

  it('keeps displacement relative to rendered tile size while zoomed', () => {
    const offset = parallaxOffset(
      { worldX: 250, worldY: 0 },
      { x: 0, y: 0, zoom: 2 },
      { width: 1000, height: 800 },
      BOARD_CONFIG,
    )

    expectClose(offset.x * 2, BOARD_CONFIG.tile * 2 * BOARD_CONFIG.parallax)
  })

  it('cancels parallax when panning a tile to the viewport centre', () => {
    const offset = parallaxOffset(
      { worldX: 200, worldY: -150 },
      { x: -400, y: 300, zoom: 2 },
      { width: 1200, height: 800 },
      BOARD_CONFIG,
    )

    expect(offset).toEqual({ x: 0, y: 0 })
  })

  it('keeps the world point under the cursor when zooming', () => {
    const point = { x: 180, y: 75 }
    const before: Camera = { x: 48, y: -81, zoom: 0.7 }
    const after = zoomAround(point, before, 2.4)
    const worldBefore = screenToWorld(point, before)
    const worldAfter = screenToWorld(point, after)

    expectClose(worldAfter.x, worldBefore.x)
    expectClose(worldAfter.y, worldBefore.y)
  })

  it('uses the fixed grid for hit testing', () => {
    expect(cellAtPoint({ x: 0, y: 0 }, camera, DEMO_BOARD, BOARD_CONFIG)).toEqual(
      { x: 10, y: 7 },
    )
    expect(cellAtPoint({ x: 39, y: 0 }, camera, DEMO_BOARD, BOARD_CONFIG)).toBeNull()
    expect(
      cellAtPoint({ x: 5000, y: 0 }, camera, DEMO_BOARD, BOARD_CONFIG),
    ).toBeNull()

    const centre = tileCentre({ x: 5, y: 4 }, DEMO_BOARD, BOARD_CONFIG)
    const moved: Camera = { x: 36, y: 88, zoom: 1.7 }
    expect(
      cellAtPoint(
        {
          x: centre.worldX * moved.zoom + moved.x,
          y: centre.worldY * moved.zoom + moved.y,
        },
        moved,
        DEMO_BOARD,
        BOARD_CONFIG,
      ),
    ).toEqual({ x: 5, y: 4 })
  })
})

describe('hole profile', () => {
  it('produces evenly spaced depths and blends', () => {
    expect(holeProfile({ layers: 5, maxDepth: 10, colourOffset: 0.5 })).toEqual([
      { height: -2, blend: 0.6 },
      { height: -4, blend: 0.7 },
      { height: -6, blend: 0.8 },
      { height: -8, blend: 0.9 },
      { height: -10, blend: 1 },
    ])
  })

  it('retains the demo hole depth and colour offset', () => {
    const profile = holeProfile(BOARD_CONFIG.hole)

    expect(profile).toHaveLength(8)
    expect(profile[0]?.height).toBe(-2)
    expectClose(profile[0]?.blend ?? 0, 0.475)
    expect(profile[7]).toEqual({ height: -16, blend: 1 })
  })

  it('uses maximum depth and blend for one layer', () => {
    expect(holeProfile({ layers: 1, maxDepth: 7, colourOffset: 0.4 })).toEqual([
      { height: -7, blend: 1 },
    ])
  })
})

describe('board effects', () => {
  it('uses Euclidean distance for ripple sampling', () => {
    const ripples = [{ x: 0, y: 0, startedAt: 0 }]
    const samples = [
      { x: 3, y: 4 },
      { x: 0, y: 5 },
      { x: -4, y: -3 },
    ].map((tile) => rippleHeight(tile, ripples, 275, BOARD_CONFIG.ripple))

    expectClose(samples[0], samples[1])
    expectClose(samples[1], samples[2])
    expect(samples[0]).toBeGreaterThan(0)
  })

  it('does not affect tiles ahead of the wavefront or after expiry', () => {
    const ripples = [{ x: 0, y: 0, startedAt: 0 }]

    expectClose(
      rippleHeight({ x: 3, y: 4 }, ripples, 200, BOARD_CONFIG.ripple),
      0,
    )
    expectClose(
      rippleHeight(
        { x: 0, y: 0 },
        ripples,
        BOARD_CONFIG.ripple.lifetime * 1000,
        BOARD_CONFIG.ripple,
      ),
      0,
    )
  })

  it('attenuates ripple peaks by radial distance', () => {
    const ripples = [{ x: 0, y: 0, startedAt: 0 }]
    const near = rippleHeight(
      { x: 1, y: 0 },
      ripples,
      50,
      BOARD_CONFIG.ripple,
    )
    const far = rippleHeight(
      { x: 3, y: 0 },
      ripples,
      150,
      BOARD_CONFIG.ripple,
    )

    expectClose(far / near, Math.exp(-2 * BOARD_CONFIG.ripple.distanceFalloff))
  })

  it('superposes simultaneous ripples', () => {
    const tile = { x: 2, y: 1 }
    const first = { x: 0, y: 0, startedAt: 0 }
    const second = { x: 1, y: 1, startedAt: 30 }

    expectClose(
      rippleHeight(tile, [first, second], 200, BOARD_CONFIG.ripple),
      rippleHeight(tile, [first], 200, BOARD_CONFIG.ripple) +
        rippleHeight(tile, [second], 200, BOARD_CONFIG.ripple),
    )
  })

  it('interpolates hover and clamps solid height', () => {
    expectClose(smoothstep(0.5), 0.5)
    expectClose(approach(0, 1, 0.2), 0.2)
    expectClose(approach(0.9, 1, 0.2), 1)
    expectClose(approach(0.1, 0, 0.2), 0)
    expect(surfaceEffect(1, 0, BOARD_CONFIG)).toEqual({
      height: 1.75,
      scale: 1.025,
    })
    expect(surfaceEffect(0, -100, BOARD_CONFIG).height).toBe(0.12)
  })

  it('retains item spacing while the supporting surface lifts', () => {
    const supportHeight = 3 / BOARD_CONFIG.parallaxReferenceLayer
    const itemHeight = 6 / BOARD_CONFIG.parallaxReferenceLayer

    for (const multiplier of [0.12, 0.4, 1, 1.75, 8]) {
      const supportDepth = liftedDepth(
        supportHeight,
        supportHeight,
        multiplier,
      )
      const itemDepth = liftedDepth(itemHeight, supportHeight, multiplier)
      expectClose(itemDepth - supportDepth, itemHeight - supportHeight)
      expectClose(liftedDepth(1, 1, multiplier), multiplier)
    }
    expectClose(liftedDepth(-4, -4, 8), -4)
  })

  it('retains the floor, wall stack, and laser recipes', () => {
    expect(BOARD_RECIPES.empty.slices).toEqual([
      { layer: 0, component: 'ground', shadow: true },
      { layer: 1, component: 'ground' },
      { layer: 2, component: 'ground' },
      { layer: 3, component: 'surface' },
    ])
    expect(BOARD_RECIPES.wallStack.slices).toHaveLength(14)
    expect(BOARD_RECIPES.wallStack.slices.filter((slice) => slice.shadow)).toHaveLength(1)
    expect(BOARD_COMPONENTS.wallBlack.width).toBe(0.6)
    expect(BOARD_RECIPES.laser.slices.slice(4).map((slice) => slice.layer)).toEqual([
      3, 4, 5, 6,
    ])
    expect(BOARD_COMPONENTS.laser1.width).toBe(0.82)
  })
})
