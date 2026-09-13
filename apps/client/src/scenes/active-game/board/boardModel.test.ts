import { describe, expect, it } from 'vitest'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
} from './boardConfig.ts'
import { DEMO_BOARD } from './demoBoard.ts'
import {
  createBoardRenderModel,
  validateBoardRendering,
} from './boardModel.ts'

describe('createBoardRenderModel', () => {
  it('creates a complete row-major grid', () => {
    const board = createBoardRenderModel(3, 2, {
      hole: [[1, 0]],
      laser: [[2, 1]],
    })

    expect(board.cells.map(({ x, y, tile }) => ({ x, y, tile }))).toEqual([
      { x: 0, y: 0, tile: 'empty' },
      { x: 1, y: 0, tile: 'hole' },
      { x: 2, y: 0, tile: 'empty' },
      { x: 0, y: 1, tile: 'empty' },
      { x: 1, y: 1, tile: 'empty' },
      { x: 2, y: 1, tile: 'laser' },
    ])
    expect(board.cells.every((cell) => Object.values(cell.walls).every((wall) => !wall))).toBe(true)
  })

  it('rejects invalid dimensions and assignments', () => {
    expect(() => createBoardRenderModel(0, 1)).toThrow(RangeError)
    expect(() => createBoardRenderModel(1, 1, { hole: [[1, 0]] })).toThrow(
      RangeError,
    )
    expect(() =>
      createBoardRenderModel(2, 1, {
        hole: [[1, 0]],
        laser: [[1, 0]],
      }),
    ).toThrow(/assigned twice/)
  })

  it('normalizes directional walls on every tile', () => {
    const board = createBoardRenderModel(2, 1, {
      walls: [{ x: 1, y: 0, north: true, west: true }],
    })

    expect(board.cells[0].walls).toEqual({
      north: false,
      east: false,
      south: false,
      west: false,
    })
    expect(board.cells[1].walls).toEqual({
      north: true,
      east: false,
      south: false,
      west: true,
    })
    expect(Object.isFrozen(board.cells[1].walls)).toBe(true)
    expect(Object.isFrozen(board.cells[1])).toBe(true)
    expect(Object.isFrozen(board.cells)).toBe(true)
  })

  it('rejects duplicate and off-board wall assignments', () => {
    expect(() =>
      createBoardRenderModel(1, 1, {
        walls: [
          { x: 0, y: 0, north: true },
          { x: 0, y: 0, east: true },
        ],
      }),
    ).toThrow(/assigned twice/)
    expect(() =>
      createBoardRenderModel(1, 1, {
        walls: [{ x: -1, y: 0, north: true }],
      }),
    ).toThrow(/outside the board/)
  })
})

describe('board rendering definition', () => {
  it('retains the current demo board and visual tuning', () => {
    expect(DEMO_BOARD.cells).toHaveLength(315)
    expect(DEMO_BOARD.cells.filter((cell) => cell.tile === 'hole')).toHaveLength(
      6,
    )
    expect(
      DEMO_BOARD.cells.filter((cell) => Object.values(cell.walls).some(Boolean)),
    ).toHaveLength(6)
    expect(DEMO_BOARD.cells.filter((cell) => cell.tile === 'laser')).toHaveLength(
      4,
    )
    expect(
      DEMO_BOARD.cells.filter((cell) => cell.tile === 'testTank'),
    ).toHaveLength(3)
    expect(
      DEMO_BOARD.cells
        .filter((cell) => cell.tile === 'testTank')
        .map((cell) => cell.colour),
    ).toEqual(['#4D8DEB', '#E55F5F', '#4CAF70'])
    expect(BOARD_CONFIG.parallax).toBe(0.07)
    expect(BOARD_CONFIG.edgeWall).toEqual({ width: 12, cornerRadius: 5 })
    expect(BOARD_COMPONENTS.wallBlack.width).toBe(0.6)
    expect(BOARD_COMPONENTS.laser1.width).toBe(0.82)
    expect(BOARD_COMPONENTS.laser1.asset).toEqual({
      symbol: 'laser1',
      viewBox: '0 0 72 72',
    })
  })

  it('keeps pillars and laser slices on their requested planes', () => {
    expect(BOARD_RECIPES.pillar.slices.map((slice) => slice.layer)).toEqual(
      Array.from({ length: 14 }, (_, layer) => layer),
    )
    expect(BOARD_RECIPES.laser.stackBaseLayer).toBe(3)
    expect(BOARD_RECIPES.laser.slices.slice(4)).toEqual([
      { layer: 3, component: 'laser1', order: 1 },
      { layer: 4, component: 'laser1' },
      { layer: 5, component: 'laser2' },
      { layer: 6, component: 'laser3' },
    ])
    expect(BOARD_RECIPES.testTank.slices.slice(4)).toEqual([
      { layer: 3, component: 'testTank1', order: 1 },
      { layer: 4, component: 'testTank2' },
      { layer: 5, component: 'testTank3' },
      { layer: 6, component: 'testTank4' },
      { layer: 7, component: 'testTank5' },
    ])
  })

  it('rejects unavailable planes and shadows above ground', () => {
    expect(() =>
      validateBoardRendering(BOARD_CONFIG, BOARD_COMPONENTS, {
        ...BOARD_RECIPES,
        empty: {
          slices: [{ layer: 14, component: 'ground' }],
        },
      }),
    ).toThrow(/unavailable layer/)
    expect(() =>
      validateBoardRendering(BOARD_CONFIG, BOARD_COMPONENTS, {
        ...BOARD_RECIPES,
        empty: {
          slices: [{ layer: 1, component: 'ground', shadow: true }],
        },
      }),
    ).toThrow(/shadow above ground/)
  })
})
