import { describe, expect, it } from 'vitest'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
} from './boardConfig.ts'
import { DEMO_BOARD, DEMO_ROBOTS } from './demoBoard.ts'
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

  it('copies antenna configuration and rejects off-board positions or invalid facing', () => {
    const antenna = { x: 1, y: 0, angle: Math.PI / 4 }
    const board = createBoardRenderModel(2, 1, { antenna })
    antenna.x = 0
    expect(board.antenna).toEqual({ x: 1, y: 0, angle: Math.PI / 4 })
    expect(Object.isFrozen(board.antenna)).toBe(true)
    expect(() => createBoardRenderModel(1, 1, { antenna: { ...antenna, x: 1 } })).toThrow(RangeError)
    expect(() => createBoardRenderModel(1, 1, { antenna: { ...antenna, angle: NaN } })).toThrow(RangeError)
  })

  it('keeps both gear directions alongside their walls', () => {
    const board = createBoardRenderModel(3, 1, {
      gearClockwise: [[0, 0]], gearCounterclockwise: [[1, 0]],
      walls: [{ x: 0, y: 0, north: true }],
    })
    expect(board.cells.map(({ tile }) => tile)).toEqual(['gearClockwise', 'gearCounterclockwise', 'empty'])
    expect(board.cells[0].walls.north).toBe(true)
  })

  it('rejects gears outside the board and conflicting tile assignments', () => {
    expect(() => createBoardRenderModel(1, 1, { gearClockwise: [[1, 0]] })).toThrow(/outside the board/)
    expect(() => createBoardRenderModel(1, 1, {
      gearClockwise: [[0, 0]], gearCounterclockwise: [[0, 0]],
    })).toThrow(/assigned twice/)
    expect(() => createBoardRenderModel(1, 1, {
      hole: [[0, 0]], gearCounterclockwise: [[0, 0]],
    })).toThrow(/assigned twice/)
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

  it('stores checkpoints on cells alongside walls and tile state', () => {
    const board = createBoardRenderModel(2, 1, {
      walls: [{ x: 1, y: 0, north: true }],
      checkpoints: [{ x: 1, y: 0, checkpointNumber: 2 }],
    })
    expect(board.cells[0].checkpointNumber).toBeUndefined()
    expect(board.cells[1]).toMatchObject({ tile: 'empty', checkpointNumber: 2, walls: { north: true } })
    expect(Object.isFrozen(board.cells[1])).toBe(true)
  })

  it('rejects invalid checkpoint assignments', () => {
    for (const checkpointNumber of [0, -1, 1.5, Infinity]) {
      expect(() => createBoardRenderModel(1, 1, {
        checkpoints: [{ x: 0, y: 0, checkpointNumber }],
      })).toThrow(RangeError)
    }
    expect(() => createBoardRenderModel(1, 1, {
      checkpoints: [{ x: 1, y: 0, checkpointNumber: 1 }],
    })).toThrow(/outside the board/)
    expect(() => createBoardRenderModel(1, 1, {
      checkpoints: [{ x: 0, y: 0, checkpointNumber: 1 }, { x: 0, y: 0, checkpointNumber: 2 }],
    })).toThrow(RangeError)
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
    expect(DEMO_ROBOTS.map((robot) => robot.position)).toEqual([
      { coordinate: { x: 9, y: 7 }, orientation: 'WEST' },
      { coordinate: { x: 10, y: 7 }, orientation: 'NORTH' },
      { coordinate: { x: 11, y: 7 }, orientation: 'SOUTH' },
    ])
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
