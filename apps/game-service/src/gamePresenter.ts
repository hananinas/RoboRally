import type {
  Card as CardPayload,
  CardsDealt,
  GamePhase as GamePhasePayload,
  Orientation,
  PublicGameState,
  RobotActionResolved,
  Tile as TilePayload,
} from '@robo-rally/game-events'
import {
  Direction,
  EmptyTile,
  type Card,
  type Game,
  type GameId,
  type GamePhase,
  type Player,
  type RobotActionResult,
} from './game/index.js'

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

function presentCard(card: Card): CardPayload {
  return { id: card.id, instruction: card.instruction }
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
): PublicGameState {
  const tiles = Array.from({ length: game.board.height }, (_, y) =>
    Array.from({ length: game.board.width }, (_, x) => presentTile(game, x, y)),
  ).flat()

  return {
    gameId,
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
  }
}

export function presentCardsDealt(player: Player): CardsDealt {
  return { cards: player.hand.map(presentCard) }
}

export function presentRobotActionResolved(
  action: RobotActionResult,
): RobotActionResolved {
  return {
    robotId: action.robotId,
    instruction: action.card.instruction,
    position: {
      coordinate: action.position,
      orientation: orientations[action.direction],
    },
  }
}
