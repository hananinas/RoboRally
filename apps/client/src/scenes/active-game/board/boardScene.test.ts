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
    expect(scene.planes.flat()).toHaveLength(1323)
    expect(scene.planes[0]).toHaveLength(316)
    expect(scene.planes[13]).toHaveLength(1)
  })

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

  it('renders the debug tank as five stacked sprite layers', () => {
    const tankPieces = scene.planes
      .flat()
      .filter((piece) => piece.cell.x === 10 && piece.cell.y === 7)

    expect(tankPieces.slice(4).map((piece) => piece.componentName)).toEqual([
      'testTank1',
      'testTank2',
      'testTank3',
      'testTank4',
      'testTank5',
    ])
    expect(tankPieces.slice(4).map((piece) => piece.slice.layer)).toEqual([
      3, 4, 5, 6, 7,
    ])
  })
})
