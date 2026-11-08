import type {
  Card as CardPayload,
  CardsDealt,
  GamePhase as GamePhasePayload,
  Orientation,
  PublicGameState,
  Winner,
  RobotActionResolved,
  PlayerState,
  Tile as TilePayload,
} from '@robo-rally/game-events'
import {
  Direction,
  type Card,
  type Game,
  type GameId,
  type GamePhase,
  type NextActionResult,
  type Player,
} from '@/game/index'
import { Integer } from '@/numbers'

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
  const tile = game.board.getTile({ x: Integer(x), y: Integer(y) })
  if (tile === undefined) {
    throw new Error(`Missing tile at ${x},${y}`)
  }

  const walls = [...tile.walls].map((direction) => orientations[direction])
  return {
    position: { x: Integer(x), y: Integer(y) },
    type: tile.kind,
    ...(walls.length === 0 ? {} : { walls }),
    ...(tile.checkpointNumber === undefined ? {} : { checkpointNumber: tile.checkpointNumber }),
  }
}

export function presentPublicGameState(
  gameId: GameId,
  game: Game,
  players: readonly PlayerState[] = [],
  winner: Winner | null = null,
): PublicGameState {
  const tiles = Array.from({ length: game.board.height }, (_, y) =>
    Array.from({ length: game.board.width }, (_, x) => presentTile(game, x, y)),
  ).flat()

  return {
    gameId,
    checkpointCount: game.board.checkpointCount,
    players,
    antenna: game.board.antenna,
    board: {
      width: game.board.width,
      height: game.board.height,
      tiles,
    },
    robots: game.players.map((player) => ({
      robotId: player.robot.id,
      playerId: player.id,
      colour: player.robot.colour,
      position: {
        coordinate: game.board.positionOf(player.robot.id),
        orientation: orientations[player.robot.direction],
      },
      startPosition: game.startPositionOf(player.robot.id),
    })),
    phase: phases[game.phase],
    paused: game.paused,
    aborted: game.aborted,
    winner,
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
  game: Game,
  result: NextActionResult,
): RobotActionResolved {
  const { action, registerIndex } = result
  const player = game.players.find((candidate) => candidate.robot.id === action.robotId)
  if (!player) throw new Error(`Missing owner for robot ${action.robotId}`)
  return {
    gameId,
    registerIndex,
    robotId: action.robotId,
    playerId: player.id,
    instruction: action.card.instruction,
    position: {
      coordinate: action.position,
      orientation: orientations[action.direction],
    },
    pushedRobots: result.pushedRobots.map((robot) => ({
      robotId: robot.robotId,
      position: { coordinate: robot.position, orientation: orientations[robot.direction] },
    })),
  }
}
