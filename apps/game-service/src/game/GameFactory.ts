import { randomUUID } from 'node:crypto'
import { Card } from '@/game/Card'
import { createBoard, type BoardMapName } from '@/game/BoardFactory'
import { boardMaps, type MapSpec } from '@/game/boardMaps'
import { Game } from '@/game/Game'
import type { GameId } from '@/game/ids'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { Direction } from '@/game/spatial'


const CARD_IDS = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000106',
  '00000000-0000-4000-8000-000000000107',
  '00000000-0000-4000-8000-000000000108',
  '00000000-0000-4000-8000-000000000109',
] as const

const HAND_INSTRUCTIONS = [
  'MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT',
  'TURN_RIGHT', 'U_TURN', 'MOVE_1', 'TURN_LEFT',
] as const

export function createHand(cardIds: readonly string[] = CARD_IDS): readonly Card[] {
  return cardIds.map((id, index) => new Card(id, HAND_INSTRUCTIONS[index]))
}

export function createPlayer(): Player {
  const cardIds = HAND_INSTRUCTIONS.map(() => randomUUID())
  return new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH), createHand(cardIds))
}


export function createGame(
  mapName: BoardMapName = 'test-map',
  name?: string,
): Readonly<{ gameId: GameId; game: Game }> {
  const map: MapSpec = boardMaps[mapName]
  const game = new Game(createBoard(mapName), [], createHand(), map.rebootTile, name)
  return { gameId: randomUUID(), game }
}
