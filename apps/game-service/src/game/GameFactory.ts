import { randomUUID } from 'node:crypto'
import { createBoard } from '@/game/BoardFactory'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import { Deck, createDeckCards } from '@/game/Deck'
import { Game } from '@/game/Game'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { Direction } from '@/game/spatial'
import type { BoardMapName } from '@/game/boardMaps'

export function createPlayer(random?: () => number): Player {
  const player = new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH), Deck.fromTemplate())
  player.drawHand(random)
  return player
}

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