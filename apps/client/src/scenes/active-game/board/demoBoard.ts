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
  wallStack: [
    [8, 4],
    [12, 4],
    [4, 6],
    [16, 8],
    [8, 10],
    [12, 10],
  ],
  laser: [
    [10, 3],
    [6, 7],
    [14, 7],
    [10, 11],
  ],
})
