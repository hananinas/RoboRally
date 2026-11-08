import { randomUUID } from 'node:crypto'
import { createBoard, type BoardMapName } from '@/game/BoardFactory'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import { Deck, createDeckCards, createHand } from '@/game/Deck'
import { Game } from '@/game/Game'
import type { GameId } from '@/game/ids'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { Direction } from '@/game/spatial'

const GAME_ID: GameId = '00000000-0000-4000-8000-000000000001'
const SHARED_GAME_NAME = 'Shared game'

export function createPlayer(random?: () => number): Player {
  const deck = new Deck(createDeckCards())
  return new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH), createHand(deck, random), deck)
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
  const game = new Game(createBoard(mapName), [], createDeckCards(), map.rebootTile, name, random, drawRandom)
  return { gameId: GAME_ID, game }
}

export function createDefaultGame(
  random?: () => number,
  drawRandom?: () => number,
): Readonly<{ gameId: string; game: Game }> {
  return { ...createGame('test-map', undefined, random, drawRandom), gameId: randomUUID() }
}