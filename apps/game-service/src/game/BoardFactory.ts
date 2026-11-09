import { Board } from '@/game/Board'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import type { Direction } from '@/game/spatial'
import { EmptyTile, PitTile, ConveyorTile, type Tile } from '@/game/Tile'
import { Integer } from '@/numbers'

export type BoardMapName = keyof typeof boardMaps

const MAPS: Readonly<Record<BoardMapName, MapSpec>> = boardMaps

const DEFAULT_MAP: BoardMapName = 'empty-map'

export function createBoard(mapName: BoardMapName = DEFAULT_MAP): Board {
  const { width, height, walls, checkpoints, antenna, pits = [],  conveyors = [],  startTiles, maxPlayers } = MAPS[mapName]
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Map "${mapName}" must have a positive integer width and height`)
  }

  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => new Set<Direction>()),
  )
  for (const { at, directions } of walls) {
    const [x, y] = at
    const tile = tiles[y]?.[x]

    if (!tile) throw new RangeError(`Wall at (${x}, ${y}) in map "${mapName}" is outside the board`)
    for (const direction of directions) tile.add(direction)
  }

  const checkpointNumbers = Array.from({ length: height }, () =>
    Array<number | undefined>(width).fill(undefined),
  )
  checkpoints.forEach(([x, y], index) => {
    if (!tiles[y]?.[x]) {
      throw new RangeError(`Checkpoint at (${x}, ${y}) in map "${mapName}" is outside the board`)
    }
    if (checkpointNumbers[y][x] !== undefined) {
      throw new RangeError(`Multiple checkpoints occupy (${x}, ${y}) in map "${mapName}"`)
    }
    checkpointNumbers[y][x] = index + 1
  })

  const boardTiles: Tile[][] = tiles.map((row, y) => row.map(
    (tileWalls, x) => new EmptyTile(tileWalls, checkpointNumbers[y][x]),
  ))
  for (const [x, y] of pits) {
    if (!tiles[y]?.[x] || checkpointNumbers[y][x] !== undefined) {
      throw new RangeError(`Pit at (${x}, ${y}) in map "${mapName}" must occupy a non-checkpoint board tile`)
    }
    boardTiles[y][x] = new PitTile(tiles[y][x])
  }

  for (const { at: [x, y], sprite, direction } of conveyors) {
    const tile = boardTiles[y]?.[x]

    if (!tile || tile.kind !== 'EMPTY') {
      throw new RangeError(
        `Conveyor at (${x}, ${y}) in map "${mapName}" must occupy an unused board tile`,
      )
    }

    boardTiles[y][x] = new ConveyorTile(
      sprite,
      direction,
      tile.walls,
      tile.checkpointNumber,
    )
  if (startTiles.length < maxPlayers) {
    throw new RangeError(`Map "${mapName}" needs a starting tile for each of its ${maxPlayers} players`)
  }

  return new Board(
    boardTiles,
    antenna,
    {
      name: MAPS[mapName].name,
      icon: MAPS[mapName].icon,
      maxPlayers,
    },
    startTiles.map(([x, y]) => ({ x: Integer(x), y: Integer(y) })),
  )
}
