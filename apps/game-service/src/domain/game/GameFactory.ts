import { boards } from '@/domain/game/BoardFactory'
import { DECK_INSTRUCTIONS } from '@/domain/game/deckComposition'
import { Game } from '@/domain/game/Game'
import type { BoardMapName } from '@/domain/game/boardMaps'

export function createGame(mapName: BoardMapName, name: string): Game {
  return new Game({
    board: boards[mapName],
    players: [],
    deck: DECK_INSTRUCTIONS,
    name,
  })
}