import { createBoard } from '@/domain/game/BoardFactory'
import { DECK_INSTRUCTIONS } from '@/domain/game/deckComposition'
import { Game } from '@/domain/game/Game'
import { boardMaps, type BoardMapName } from '@/domain/game/boardMaps'

export function createGame(mapName: BoardMapName, name: string): Game {
  return new Game({
    board: createBoard(boardMaps[mapName]),
    players: [],
    deck: DECK_INSTRUCTIONS,
    name,
  })
}