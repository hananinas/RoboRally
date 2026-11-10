import { describe, expect, it } from 'vitest'
import { BOARD_CONFIG } from './boardConfig.ts'
import { createBoardRenderModel } from './boardModel.ts'
import { beamReach, laserAngle, traceBeam, traceBeams } from './laserBeam.ts'

describe('traceBeam', () => {
  it('runs to the map edge when nothing blocks it', () => {
    const board = createBoardRenderModel(5, 1)
    expect(traceBeam(board, { x: 1, y: 0, orientation: 'EAST' }, [])).toEqual({
      x: 1, y: 0, orientation: 'EAST', cells: 3, end: 'edge',
    })
    expect(traceBeam(board, { x: 1, y: 0, orientation: 'WEST' }, [])).toMatchObject({ cells: 1, end: 'edge' })
  })

  it.each([
    ['NORTH', { x: 2, y: 3 }, 3],
    ['SOUTH', { x: 2, y: 0 }, 3],
    ['EAST', { x: 0, y: 2 }, 3],
    ['WEST', { x: 3, y: 2 }, 3],
  ] as const)('travels %s until the map edge', (orientation, start, cells) => {
    const board = createBoardRenderModel(4, 4)
    expect(traceBeam(board, { ...start, orientation }, [])).toMatchObject({ cells, end: 'edge' })
  })

  it('stops at a wall on the near or far side of a cell boundary', () => {
    const near = createBoardRenderModel(5, 1, { walls: [{ x: 2, y: 0, east: true }] })
    const far = createBoardRenderModel(5, 1, { walls: [{ x: 3, y: 0, west: true }] })
    for (const board of [near, far]) {
      expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, [])).toMatchObject({ cells: 2, end: 'wall' })
    }
  })

  it('is blocked by a wall in its own cell', () => {
    const board = createBoardRenderModel(3, 1, { walls: [{ x: 0, y: 0, east: true }] })
    expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, [])).toMatchObject({ cells: 0, end: 'wall' })
  })

  it('ignores walls that run alongside it', () => {
    const board = createBoardRenderModel(3, 1, {
      walls: [{ x: 1, y: 0, north: true, south: true }],
    })
    expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, [])).toMatchObject({ cells: 2, end: 'edge' })
  })

  it('is blocked by a pillar', () => {
    const board = createBoardRenderModel(4, 1, {
      walls: [{ x: 2, y: 0, north: true, east: true, south: true, west: true }],
    })
    expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, [])).toMatchObject({ cells: 1, end: 'wall' })
  })

  it('stops at the first robot, including one on the laser tile', () => {
    const board = createBoardRenderModel(5, 1)
    const robots = [{ x: 3, y: 0 }, { x: 2, y: 0 }]
    expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, robots)).toMatchObject({ cells: 2, end: 'robot' })
    expect(traceBeam(board, { x: 2, y: 0, orientation: 'EAST' }, robots)).toMatchObject({ cells: 0, end: 'robot' })
  })

  it('prefers a robot over a wall in the same cell', () => {
    const board = createBoardRenderModel(3, 1, { walls: [{ x: 1, y: 0, east: true }] })
    expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, [{ x: 1, y: 0 }])).toMatchObject({
      cells: 1, end: 'robot',
    })
  })

  it('does not stop for robots behind a wall or off its row', () => {
    const board = createBoardRenderModel(4, 2, { walls: [{ x: 1, y: 0, east: true }] })
    const robots = [{ x: 3, y: 0 }, { x: 2, y: 1 }]
    expect(traceBeam(board, { x: 0, y: 0, orientation: 'EAST' }, robots)).toMatchObject({ cells: 1, end: 'wall' })
  })
})

describe('traceBeams', () => {
  it('traces every laser tile using its own orientation', () => {
    const board = createBoardRenderModel(4, 3, {
      laser: [{ x: 0, y: 0, orientation: 'EAST' }, { x: 3, y: 2, orientation: 'NORTH' }],
    })
    expect(traceBeams(board, [{ x: 2, y: 0 }])).toEqual([
      { x: 0, y: 0, orientation: 'EAST', cells: 2, end: 'robot' },
      { x: 3, y: 2, orientation: 'NORTH', cells: 2, end: 'edge' },
    ])
    expect(traceBeams(createBoardRenderModel(2, 2), [])).toEqual([])
  })
})

describe('beamReach', () => {
  const { tile, gap } = BOARD_CONFIG
  const pitch = tile + gap

  it('ends at the robot centre or at the far edge of the last cell', () => {
    const beam = { x: 0, y: 0, orientation: 'EAST', cells: 2 } as const
    expect(beamReach({ ...beam, end: 'robot' }, BOARD_CONFIG)).toBe(2 * pitch)
    expect(beamReach({ ...beam, end: 'wall' }, BOARD_CONFIG)).toBe(2 * pitch + tile / 2)
    expect(beamReach({ ...beam, end: 'edge' }, BOARD_CONFIG)).toBe(2 * pitch + tile / 2)
  })
})

describe('laserAngle', () => {
  it('treats east as the artwork direction', () => {
    expect(laserAngle('EAST')).toBe(0)
    expect(laserAngle('SOUTH')).toBe(90)
    expect(laserAngle('WEST')).toBe(180)
    expect(laserAngle('NORTH')).toBe(-90)
  })
})
