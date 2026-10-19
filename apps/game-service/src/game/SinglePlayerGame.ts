import { Board } from '@/game/Board'
import { Card } from '@/game/Card'
import { Game } from '@/game/Game'
import type { GameId } from '@/game/ids'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { Direction } from '@/game/spatial'
import { EmptyTile } from '@/game/Tile'

const BOARD_WIDTH = 21
const BOARD_HEIGHT = 15

const GAME_ID: GameId = '00000000-0000-4000-8000-000000000001'
const SHARED_GAME_NAME = 'Shared game'
const PLAYER_ID = '00000000-0000-4000-8000-000000000002'
const ROBOT_ID = '00000000-0000-4000-8000-000000000003'

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

export type SinglePlayerGame = Readonly<{
  gameId: GameId
  game: Game
  player: Player
}>

function createBoard(): Board {
  const tiles = Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => new EmptyTile()),
  )
  tiles[6][10] = new EmptyTile([], 1)
  tiles[9][8] = new EmptyTile([], 2)
  return new Board(tiles)
}

const HAND_INSTRUCTIONS = [
  'MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT',
  'TURN_RIGHT', 'U_TURN', 'MOVE_1', 'TURN_LEFT',
] as const

export function createHand(cardIds: readonly string[] = CARD_IDS): readonly Card[] {
  return cardIds.map((id, index) => new Card(id, HAND_INSTRUCTIONS[index]))
}

export function createSharedGame(): Readonly<{ gameId: GameId; game: Game }> {
  return { gameId: GAME_ID, game: new Game(createBoard(), [], createHand(),undefined, SHARED_GAME_NAME) }
}

export function createSinglePlayerGame(): SinglePlayerGame {
  const board = createBoard()
  const robot = new Robot(ROBOT_ID, Direction.NORTH)
  board.placeRobot(robot.id, { x: 10, y: 7 })

  const player = new Player(PLAYER_ID, robot)
  const game = new Game(board, [player], createHand())

  return Object.freeze({ gameId: GAME_ID, game, player })
}
