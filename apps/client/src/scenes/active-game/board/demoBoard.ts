import { createBoardRenderModel } from './boardModel.ts'

export const DEMO_BOARD = createBoardRenderModel(21, 15, {
  hole: [
    [3, 3],
    [9, 2],
    [16, 4],
    [5, 10],
    [12, 11],
    [18, 9],
  ],
  walls: [
    { x: 8, y: 4, west: true },
    { x: 12, y: 4, east: true },
    { x: 4, y: 6, north: true },
    { x: 16, y: 8, south: true, north: true },
    { x: 8, y: 10, north: true, east: true },
    { x: 12, y: 10, north: true, east: true, south: true, west: true },
  ],
  laser: [
    [10, 3],
    [6, 7],
    [14, 7],
    [10, 11],
  ],
  testTank: [[10, 7]],
})
