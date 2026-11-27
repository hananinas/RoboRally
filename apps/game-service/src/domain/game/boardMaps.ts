import type { GearRotation } from '@robo-rally/game-events'
import type { Antenna } from '@/domain/game/Board'
import { Direction } from '@/domain/game/spatial'
import { Integer } from '@/numbers'

const { NORTH: N, WEST: W, SOUTH: S, EAST: E } = Direction

const EMPTY_MAP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 3">' +
  '<rect width="3" height="3" fill="#6b7280"/>' +
  '<path d="M1 0V3M2 0V3M0 1H3M0 2H3" stroke="#d1d5db" stroke-width="0.05"/>' +
  '</svg>'

const TEST_MAP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3">' +
  '<rect width="4" height="3" fill="#6b7280"/>' +
  '<path d="M1 0V3M2 0V3M3 0V3M0 1H4M0 2H4" stroke="#d1d5db" stroke-width="0.05"/>' +
  '<rect x="0.35" y="1.02" width="3.3" height="0.96" rx="0.12" fill="#1f2937" fill-opacity="0.88"/>' +
  '<text x="2" y="1.72" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="0.64" font-weight="700" letter-spacing="0.04">TEST</text>' +
  '</svg>'

export type WallSpec = Readonly<{
  at: readonly [x: number, y: number]
  directions: readonly Direction[]
}>

export type ConveyorSpec = Readonly<{
  at: readonly [x: number, y: number]
  sprite: string
  direction: Direction
}>

export type GearSpec = Readonly<{ at: readonly [number, number]; rotation: GearRotation }>

export type MapSpec = Readonly<{
  name: string
  icon: string
  width: number
  height: number
  antenna: Antenna
  walls: readonly WallSpec[]
  checkpoints: readonly (readonly [x: number, y: number])[]
  pits?: readonly (readonly [x: number, y: number])[]
  gears?: readonly GearSpec[]
  conveyors?: readonly ConveyorSpec[]
  startTiles: readonly (readonly [x: number, y: number])[]
  // Four tiles where robots reappear after falling; see Game.rebootRobot.
  rebootTiles: readonly (readonly [x: number, y: number])[]
}>

export const boardMaps = {
  'empty-map': {
    name: 'Empty Map',
    icon: `data:image/svg+xml;base64,${Buffer.from(EMPTY_MAP_SVG).toString('base64')}`,
    width: 21,
    height: 15,
    antenna: { x: Integer(10), y: Integer(0), angle: Math.PI / 2 },
    rebootTiles: [[3, 3], [17, 3], [3, 11], [17, 11]],
    walls: [],
    startTiles: [[10, 7], [9, 7], [8, 7], [7, 7], [6, 7], [5, 7]],
    checkpoints: [[10, 6], [8, 9]],
  },
  'test-map': {
    name: 'Test Map',
    icon: `data:image/svg+xml;base64,${Buffer.from(TEST_MAP_SVG).toString('base64')}`,
    width: 16,
    height: 15,
    pits: [[3, 3], [13, 4], [12, 7], [15, 9], [5, 10], [12, 11]],
    gears: [
      { at: [9, 6], rotation: 'CLOCKWISE' },
      { at: [11, 8], rotation: 'COUNTERCLOCKWISE' },
    ],
    conveyors: [
      // Conveyor loop
      { at: [4, 7], sprite: 'conveyor-1-from-right', direction: E },
      { at: [5, 7], sprite: 'conveyor-1-straight', direction: E },
      { at: [6, 7], sprite: 'conveyor-1-from-right', direction: S },

      { at: [6, 8], sprite: 'conveyor-1-straight', direction: S },

      { at: [6, 9], sprite: 'conveyor-1-from-right', direction: W },
      { at: [5, 9], sprite: 'conveyor-1-straight', direction: W },
      { at: [4, 9], sprite: 'conveyor-1-from-right', direction: N },

      { at: [4, 8], sprite: 'conveyor-1-straight', direction: N },
    ],
    rebootTiles: [[13, 2], [2, 6], [10, 10], [2, 13]],
    antenna: { x: Integer(10), y: Integer(0), angle: Math.PI / 2 },
    checkpoints: [[10, 6], [8, 9]],
    startTiles: [[8, 7], [3, 8], [10, 13], [1, 4], [10, 3], [5, 12]],
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

export type BoardMapName = keyof typeof boardMaps

export function isBoardMapName(mapName: string): mapName is BoardMapName {
  return Object.hasOwn(boardMaps, mapName)
}
