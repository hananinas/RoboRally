import { Board } from './Board.js'
import { BackUp, Move1, Move2, Move3, TurnLeft, TurnRight, UTurn, type Card } from './Card.js'
import { Game } from './Game.js'
import type { GameId } from './ids.js'
import { Player } from './Player.js'
import { Robot } from './Robot.js'
import { Direction } from './spatial.js'
import { EmptyTile } from './Tile.js'

const BOARD_WIDTH = 21
const BOARD_HEIGHT = 15

const GAME_ID: GameId = '00000000-0000-4000-8000-000000000001'
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
  return new Board(
    Array.from({ length: BOARD_HEIGHT }, () =>
      Array.from({ length: BOARD_WIDTH }, () => new EmptyTile()),
    ),
  )
}
const HAND_CARD_TYPES =[
Move1,
Move2,
Move3, 
BackUp,
TurnLeft,
TurnRight, 
UTurn,
Move1,
TurnLeft,
] 

export function createHand(cardIds: readonly string[] = CARD_IDS): readonly Card[] {
  return cardIds.map((id, index) =>
    new HAND_CARD_TYPES[index](id)
  )
}

export function createSharedGame(): Readonly<{ gameId: GameId; game: Game }> {
  return { gameId: GAME_ID, game: new Game(createBoard(), [], createHand()) }
}

export function createSinglePlayerGame(): SinglePlayerGame {
  const board = createBoard()
  const robot = new Robot(ROBOT_ID, Direction.NORTH)
  board.placeRobot(robot.id, { x: 10, y: 7 })

  const player = new Player(PLAYER_ID, robot)
  const game = new Game(board, [player], createHand())

  return Object.freeze({ gameId: GAME_ID, game, player })
}
