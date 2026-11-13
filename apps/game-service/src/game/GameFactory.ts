import { createBoard } from '@/game/BoardFactory'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import { createDeckCards } from '@/game/Deck'
import { Game } from '@/game/Game'
import type { BoardMapName } from '@/game/boardMaps'

export function createGame(mapName: BoardMapName, name: string): Game {
  const map: MapSpec = boardMaps[mapName]
  return new Game({
    board: createBoard(mapName),
    players: [],
    deck: createDeckCards(),
    rebootTile: map.rebootTile,
    name,
  })
}