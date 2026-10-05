import type {
  Card as CardPayload,
  CardsDealt,
  GamePhase as GamePhasePayload,
  Instruction,
  Orientation,
  PublicGameState,
  RobotActionResolved,
  PlayerState,
  Tile as TilePayload,
} from '@robo-rally/game-events'
import {
  Direction,
  EmptyTile,
  Move1,
  TurnLeft,
  TurnRight,
  Move2,
  Move3,
  UTurn,
  BackUp,
  type Card,
  type Game,
  type GameId,
  type GamePhase,
  type NextActionResult,
  type Player,
} from '@/game/index'

const orientations: Record<Direction, Orientation> = {
  [Direction.NORTH]: 'NORTH',
  [Direction.EAST]: 'EAST',
  [Direction.SOUTH]: 'SOUTH',
  [Direction.WEST]: 'WEST',
}

const phases: Record<GamePhase, GamePhasePayload> = {
  programming: 'PROGRAMMING',
  activation: 'EXECUTING',
}

function instructionFor(card: Card): Instruction {
  if (card instanceof Move1) return 'MOVE_1'
  if (card instanceof TurnLeft) return 'TURN_LEFT'
  if (card instanceof Move2) return 'MOVE_2'
  if (card instanceof Move3) return 'MOVE_3'
  if (card instanceof BackUp) return 'BACK_UP'
  if (card instanceof TurnRight) return 'TURN_RIGHT'
  if (card instanceof UTurn) return 'U_TURN'
  throw new Error(`Unsupported card ${card.id}`)
}

function presentCard(card: Card): CardPayload {
  return { id: card.id, instruction: instructionFor(card) }
}

function presentTile(game: Game, x: number, y: number): TilePayload {
  const tile = game.board.getTile({ x, y })
  if (!(tile instanceof EmptyTile)) {
    throw new Error(`Unsupported tile at ${x},${y}`)
  }

  const walls = [...tile.walls].map((direction) => orientations[direction])
  return {
    position: { x, y },
    type: 'EMPTY',
    ...(walls.length === 0 ? {} : { walls }),
  }
}

export function presentPublicGameState(
  gameId: GameId,
  game: Game,
  players: readonly PlayerState[] = [],
): PublicGameState {
  const tiles = Array.from({ length: game.board.height }, (_, y) =>
    Array.from({ length: game.board.width }, (_, x) => presentTile(game, x, y)),
  ).flat()

  return {
    gameId,
    players,
    antenna: game.antenna,
    board: {
      width: game.board.width,
      height: game.board.height,
      tiles,
    },
    robots: game.players.map((player) => ({
      robotId: player.robot.id,
      playerId: player.id,
      position: {
        coordinate: game.board.positionOf(player.robot.id),
        orientation: orientations[player.robot.direction],
      },
    })),
    phase: phases[game.phase],
    paused: game.paused,
  }
}

export function presentCardsDealt(
  gameId: GameId,
  player: Player,
): CardsDealt {
  return { gameId, playerId: player.id, cards: player.hand.map(presentCard) }
}

export function presentRobotActionResolved(
  gameId: GameId,
  result: NextActionResult,
): RobotActionResolved {
  const { action, registerIndex } = result
  return {
    gameId,
    registerIndex,
    robotId: action.robotId,
    instruction: instructionFor(action.card),
    position: {
      coordinate: action.position,
      orientation: orientations[action.direction],
    },
  }
}
