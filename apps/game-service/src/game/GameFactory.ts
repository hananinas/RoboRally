import { randomUUID } from 'node:crypto'
import { createBoard } from '@/game/BoardFactory'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import { Deck, createDeckCards } from '@/game/Deck'
import { Game } from '@/game/Game'
import type { GameId } from '@/game/ids'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { Direction } from '@/game/spatial'
import type { BoardMapName } from '@/game/boardMaps'
import { Integer } from '@/numbers'

const GAME_ID: GameId = '00000000-0000-4000-8000-000000000001'
const SHARED_GAME_NAME = 'Shared game'

export function createPlayer(random?: () => number): Player {
  const player = new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH), Deck.fromTemplate())
  player.drawHand(random)
  return player
}

export function createSharedGame(): Readonly<{ gameId: GameId; game: Game }> {
  return createGame('test-map', SHARED_GAME_NAME)
}

export function createGame(
  mapName: BoardMapName = 'test-map',
  name?: string,
  random?: () => number,
  drawRandom?: () => number,
): Readonly<{ gameId: GameId; game: Game }> {
  const map: MapSpec = boardMaps[mapName]
  const game = new Game({
    board: createBoard(mapName),
    players: [],
    deck: createDeckCards(),
    rebootTiles: map.rebootTiles.map(([x, y]) => ({ x: Integer(x), y: Integer(y) })),
    name,
    random,
    drawRandom,
  })
  return { gameId: GAME_ID, game }
}

export function createDefaultGame(
  random?: () => number,
  drawRandom?: () => number,
  mapName: BoardMapName = 'test-map',
): Readonly<{ gameId: string; game: Game }> {
  return { ...createGame(mapName, undefined, random, drawRandom), gameId: randomUUID() }
}