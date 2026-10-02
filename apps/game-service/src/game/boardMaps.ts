import type { Antenna } from '@/game/Game'
import { Direction } from '@/game/spatial'

const { NORTH: N, WEST: W, SOUTH: S, EAST: E } = Direction

export type WallSpec = Readonly<{
  at: readonly [x: number, y: number]
  directions: readonly Direction[]
}>

export type MapSpec = Readonly<{
  width: number
  height: number
  antenna: Antenna
  walls: readonly WallSpec[]
}>

export const boardMaps = {
  'empty-map': {
    width: 21,
    height: 15,
    antenna: { x: 10, y: 0, angle: Math.PI / 2 },
    walls: [],
  },
  'test-map': {
    width: 16,
    height: 15,
    antenna: { x: 10, y: 0, angle: Math.PI / 2 },
    walls: [
      // TEST written top left corner of map
      { at: [1, 1], directions: [N, E] }, 
      { at: [1, 2], directions: [E] },
      { at: [2, 1], directions: [N] },
      { at: [4, 1], directions: [N, W] },
      { at: [4, 2], directions: [N, W, S] },
      { at: [6, 1], directions: [N, W, S] },
      { at: [6, 2], directions: [S, E] },
      { at: [8, 1], directions: [N, E] },
      { at: [8, 2], directions: [E] },
      { at: [9, 1], directions: [N] },

      // Wall blocking test in front of robots
      // Can check if wall on current tile, on next tile or on both blocks movement
      { at: [8, 5], directions: [S] },
      { at: [7, 6], directions: [N] },
      { at: [6, 5], directions: [S] },
      { at: [6, 6], directions: [N] },

      // Walls leading to a dead end below the robot spawn area
      { at: [8, 10], directions: [W, E] },
      { at: [8, 11], directions: [W, E] },
      { at: [8, 12], directions: [W, S, E] },

      // Showcase of all the different wall configurations on the right side of the map
      { at: [12, 0], directions: [] },
      { at: [12, 1], directions: [N] },
      { at: [12, 2], directions: [W] },
      { at: [12, 3], directions: [S] },
      { at: [12, 5], directions: [E] },
      { at: [12, 7], directions: [N, W] },
      { at: [12, 9], directions: [W, S] },
      { at: [12, 11], directions: [S, E] },
      { at: [12, 13], directions: [N, E] },
      { at: [14, 1], directions: [N, W, S, E] },
      { at: [14, 3], directions: [N, S] },
      { at: [14, 5], directions: [W, E] },
      { at: [14, 7], directions: [W, S, E] },
      { at: [14, 9], directions: [N, S, E] },
      { at: [14, 11], directions: [N, W, S] },
      { at: [14, 13], directions: [N, W, E] },

      // Loss
      { at: [1, 10], directions: [W] },
      { at: [3, 10], directions: [W, E] },
      { at: [1, 12], directions: [W, E] },
      { at: [3, 12], directions: [W, S] },
    ],
  },
} as const satisfies Record<string, MapSpec>
