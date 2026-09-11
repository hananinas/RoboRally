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

    expect(board.cells).toEqual([
      { x: 0, y: 0, recipe: 'empty' },
      { x: 1, y: 0, recipe: 'hole' },
      { x: 2, y: 0, recipe: 'empty' },
      { x: 0, y: 1, recipe: 'empty' },
      { x: 1, y: 1, recipe: 'empty' },
      { x: 2, y: 1, recipe: 'laser' },
    ])
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
})

describe('board rendering definition', () => {
  it('retains the current demo board and visual tuning', () => {
    expect(DEMO_BOARD.cells).toHaveLength(315)
    expect(DEMO_BOARD.cells.filter((cell) => cell.recipe === 'hole')).toHaveLength(
      6,
    )
    expect(
      DEMO_BOARD.cells.filter((cell) => cell.recipe === 'wallStack'),
    ).toHaveLength(6)
    expect(DEMO_BOARD.cells.filter((cell) => cell.recipe === 'laser')).toHaveLength(
      4,
    )
    expect(BOARD_CONFIG.parallax).toBe(0.07)
    expect(BOARD_COMPONENTS.wallBlack.width).toBe(0.6)
    expect(BOARD_COMPONENTS.laser1.width).toBe(0.82)
  })

  it('keeps wall stacks and laser slices on their requested planes', () => {
    expect(BOARD_RECIPES.wallStack.slices.map((slice) => slice.layer)).toEqual(
      Array.from({ length: 14 }, (_, layer) => layer),
    )
    expect(BOARD_RECIPES.laser.stackBaseLayer).toBe(3)
    expect(BOARD_RECIPES.laser.slices.slice(4)).toEqual([
      { layer: 3, component: 'laser1', order: 1 },
      { layer: 4, component: 'laser1' },
      { layer: 5, component: 'laser2' },
      { layer: 6, component: 'laser3' },
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
