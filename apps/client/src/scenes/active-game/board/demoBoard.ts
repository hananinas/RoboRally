import { createBoardRenderModel } from './boardModel.ts'
import type { Robot } from './robotPlayback.ts'

export const DEMO_BOARD = createBoardRenderModel(21, 15, {
  antenna: { x: 10, y: 0, angle: Math.PI / 2 },
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
})

export const DEMO_ROBOTS: readonly Robot[] = [
  {
    robotId: 'blue', colour: '#4D8DEB',
    position: { coordinate: { x: 9, y: 7 }, orientation: 'WEST' },      
    startPosition: { x: 9, y: 7 },
  },
  {
    robotId: 'red', colour: '#E55F5F',
    position: { coordinate: { x: 10, y: 7 }, orientation: 'NORTH' },
    startPosition: { x: 10, y: 7 },
  },
  {
    robotId: 'green', colour: '#4CAF70',
    position: { coordinate: { x: 11, y: 7 }, orientation: 'SOUTH' },
    startPosition: { x: 11, y: 7 },
  },
]
