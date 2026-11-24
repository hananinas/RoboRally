import { createBoard } from '@/domain/game/BoardFactory'
import { createDeckCards } from '@/domain/game/Deck'
import { Game } from '@/domain/game/Game'
import { boardMaps, type BoardMapName } from '@/domain/game/boardMaps'

export function createGame(mapName: BoardMapName, name: string): Game {
  return new Game({
    board: createBoard(boardMaps[mapName]),
    players: [],
    deck: createDeckCards(),
    name,
  })
}