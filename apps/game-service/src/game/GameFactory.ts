import { createBoard } from '@/game/BoardFactory'
import { createDeckCards } from '@/game/Deck'
import { Game } from '@/game/Game'
import type { BoardMapName } from '@/game/boardMaps'

export function createGame(mapName: BoardMapName, name: string): Game {
  return new Game({
    board: createBoard(mapName),
    players: [],
    deck: createDeckCards(),
    name,
  })
}