import { describe, expect, it } from 'vitest'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
} from './boardConfig.ts'
import { createBoardScene } from './boardScene.ts'
import { DEMO_BOARD } from './demoBoard.ts'

describe('createBoardScene', () => {
  const scene = createBoardScene(
    DEMO_BOARD,
    BOARD_CONFIG,
    BOARD_COMPONENTS,
    BOARD_RECIPES,
  )

  it('groups every solid slice into a global paint plane', () => {
    expect(scene.planes).toHaveLength(14)
    expect(scene.planes.flat()).toHaveLength(1312)
    expect(scene.planes[0]).toHaveLength(309)
    expect(scene.planes[13]).toHaveLength(6)
  })

  it('keeps hole depths local to their apertures', () => {
    expect(scene.holes).toHaveLength(6)
    expect(scene.holes.every((hole) => hole.depths.length === 8)).toBe(true)
    expect(scene.planes.flat().some((piece) => piece.cell.recipe === 'hole')).toBe(
      false,
    )
  })

  it('uses the laser surface as its common lift height', () => {
    const laserPieces = scene.planes
      .flat()
      .filter((piece) => piece.cell.x === 6 && piece.cell.y === 7)

    expect(laserPieces.map((piece) => piece.liftHeight)).toEqual([
      0, 0.5, 1, 1.5, 1.5, 1.5, 1.5, 1.5,
    ])
  })
})
