import type { Antenna, Board } from '@robo-rally/game-events'
import { createBoardRenderModel, type BoardRenderModel } from './boardModel.ts'

export function createBoardFromSnapshot(board: Board, antenna: Antenna): BoardRenderModel {
  return createBoardRenderModel(
    board.width,
    board.height,
    {
      antenna,
      hole: board.tiles.filter((tile) => tile.type === 'PIT')
        .map((tile) => [tile.position.x, tile.position.y] as const),
      gearClockwise: board.tiles.filter((tile) => tile.type === 'GEAR' && tile.rotation === 'CLOCKWISE')
        .map((tile) => [tile.position.x, tile.position.y] as const),
      gearCounterclockwise: board.tiles.filter((tile) => tile.type === 'GEAR' && tile.rotation === 'COUNTERCLOCKWISE')
        .map((tile) => [tile.position.x, tile.position.y] as const),
      conveyor: board.tiles.flatMap((tile) => tile.type === 'CONVEYOR' ? [{
        ...tile.position, sprite: tile.sprite, direction: tile.direction,
      }] : []),
      checkpoints: board.tiles.flatMap((tile) => tile.checkpointNumber === undefined
        ? [] : [{ ...tile.position, checkpointNumber: tile.checkpointNumber }]),
      rebootTiles: board.tiles.filter((tile) => tile.type === 'REBOOT').map((tile) => tile.position),
      walls: board.tiles.map((tile) => ({
        ...tile.position,
        north: tile.walls?.includes('NORTH'),
        east: tile.walls?.includes('EAST'),
        south: tile.walls?.includes('SOUTH'),
        west: tile.walls?.includes('WEST'),
      })),
    },
  )
}
