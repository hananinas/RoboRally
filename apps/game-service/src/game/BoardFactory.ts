import { Board } from '@/game/Board'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import type { Direction } from '@/game/spatial'
import { EmptyTile } from '@/game/Tile'

export type BoardMapName = keyof typeof boardMaps

const MAPS: Readonly<Record<BoardMapName, MapSpec>> = boardMaps

const DEFAULT_MAP: BoardMapName = 'empty-map'

export function createBoard(mapName: BoardMapName = DEFAULT_MAP): Board {
  const { width, height, walls, antenna } = MAPS[mapName]
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

  return new Board(
    tiles.map((row) => row.map((tileWalls) => new EmptyTile(tileWalls))),
    antenna,
  )
}
