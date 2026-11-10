import { describe, expect, it } from 'vitest'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
} from './boardConfig.ts'
import { createBoardScene } from './boardScene.ts'
import { createBoardRenderModel } from './boardModel.ts'
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
    expect(scene.planes.flat()).toHaveLength(1325)
    expect(scene.planes[0]).toHaveLength(316)
    expect(scene.planes[13]).toHaveLength(1)
  })

  it.each([0, Math.PI / 2, Math.PI, Math.PI * 1.25])(
    'places the complete antenna at its configured coordinate and facing %s', (angle) => {
      const board = createBoardRenderModel(4, 3, { antenna: { x: 1, y: 2, angle } })
      const scene = createBoardScene(board, BOARD_CONFIG, BOARD_COMPONENTS, BOARD_RECIPES)
      const pieces = scene.planes.flat().filter(({ cell }) => cell.x === 1 && cell.y === 2)
      expect(pieces.map(({ componentName }) => componentName)).toEqual([
        'ground', ...Array.from({ length: 10 }, (_, i) => `antenna${i + 1}`),
      ])
      expect(pieces.every((piece) => piece.angle === angle * 180 / Math.PI - 90)).toBe(true)
      expect(pieces.slice(3).every((piece) => piece.liftHeight === 1.5)).toBe(true)
      expect(scene.planes.flat().filter(({ componentName }) => componentName.startsWith('antenna'))).toHaveLength(10)
    },
  )

  it('keeps hole depths local to their apertures', () => {
    expect(scene.holes).toHaveLength(6)
    expect(scene.holes.every((hole) => hole.depths.length === 8)).toBe(true)
    expect(scene.planes.flat().some((piece) => piece.cell.tile === 'hole')).toBe(
      false,
    )
  })

  it('adds eight wall slices for every enabled edge', () => {
    const westWall = scene.planes
      .flat()
      .filter(
        (piece) =>
          piece.cell.x === 8 && piece.cell.y === 4 && piece.slice.wall === 'west',
      )

    expect(westWall.map((piece) => piece.slice.layer)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
    expect(westWall.map((piece) => piece.componentName)).toEqual([
      'wallEdgeBlack',
      'wallEdgeBlack',
      'wallEdgeYellow',
      'wallEdgeYellow',
      'wallEdgeBlack',
      'wallEdgeBlack',
      'wallEdgeYellow',
      'wallEdgeYellow',
    ])
  })

  it('replaces four edge walls with the pillar and removes the base', () => {
    const pieces = scene.planes
      .flat()
      .filter((piece) => piece.cell.x === 12 && piece.cell.y === 10)

    expect(pieces).toHaveLength(14)
    expect(pieces.every((piece) => piece.slice.wall === undefined)).toBe(true)
    expect(pieces.some((piece) => piece.componentName === 'ground')).toBe(false)
    expect(pieces.some((piece) => piece.componentName === 'surface')).toBe(false)
  })

  it('uses the laser surface as its common lift height', () => {
    const laserPieces = scene.planes
      .flat()
      .filter((piece) => piece.cell.x === 6 && piece.cell.y === 7)

    expect(laserPieces.map((piece) => piece.liftHeight)).toEqual([
      0, 0.5, 1, 1.5, 1.5, 1.5, 1.5, 1.5,
    ])
  })

  it.each([
    ['EAST', 0],
    ['SOUTH', 90],
    ['WEST', 180],
    ['NORTH', -90],
  ] as const)('turns laser artwork, but not the floor, to face %s', (orientation, angle) => {
    const board = createBoardRenderModel(1, 1, { laser: [{ x: 0, y: 0, orientation }] })
    const pieces = createBoardScene(board, BOARD_CONFIG, BOARD_COMPONENTS, BOARD_RECIPES)
      .planes.flat()
    expect(pieces.filter((piece) => piece.component.asset).map((piece) => piece.angle))
      .toEqual([angle, angle, angle, angle])
    expect(pieces.filter((piece) => !piece.component.asset).every((piece) => piece.angle === undefined))
      .toBe(true)
  })

})
