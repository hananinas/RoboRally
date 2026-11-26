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

  it('lays the reboot pad flat on the surface of reboot tiles', () => {
    const board = createBoardRenderModel(2, 1, { rebootTiles: [{ x: 1, y: 0 }] })
    const scene = createBoardScene(board, BOARD_CONFIG, BOARD_COMPONENTS, BOARD_RECIPES)
    const at = (x: number) => scene.planes.flat().filter(({ cell }) => cell.x === x)
    expect(at(1).map(({ componentName, slice }) => `${componentName}@${slice.layer}`)).toEqual([
      'ground@0', 'ground@1', 'ground@2', 'surface@3', 'reboot1@3', 'reboot2@3', 'reboot3@3', 'reboot4@3',
    ])
    expect(at(0).some(({ componentName }) => componentName.startsWith('reboot'))).toBe(false)
  })

  it('keeps hole depths local to their apertures', () => {
    expect(scene.holes).toHaveLength(6)
    expect(scene.holes.every((hole) => hole.depths.length === 8)).toBe(true)
    expect(scene.planes.flat().some((piece) => piece.cell.tile === 'hole')).toBe(
      false,
    )
  })

  it.each(['gearClockwise', 'gearCounterclockwise'] as const)('renders %s flush with the floor and preserves walls', (direction) => {
    const board = createBoardRenderModel(1, 1, {
      [direction]: [[0, 0]], walls: [{ x: 0, y: 0, north: true }],
    })
    const scene = createBoardScene(board, BOARD_CONFIG, BOARD_COMPONENTS, BOARD_RECIPES)
    const pieces = scene.planes.flat().filter(({ slice }) => !slice.wall)
    expect(pieces.map(({ componentName }) => componentName)).toEqual([
      'ground', 'gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6', 'gear7', direction,
    ])
    expect(pieces.every(({ slice }) => slice.layer <= 3)).toBe(true)
    expect(scene.planes.flat().filter(({ slice }) => slice.wall === 'north')).toHaveLength(8)
    expect(scene.holes).toEqual([])
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

})
