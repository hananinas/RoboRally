import type {
  Card as CardPayload,
  CardsDealt,
  EnvironmentStepResolved,
  GamePhase as GamePhasePayload,
  Orientation,
  Position as PositionPayload,
  PublicGameState,
  RobotActionResolved,
  PlayerState,
  Tile as TilePayload,
} from '@robo-rally/game-events'
import {
  Direction,
  GearTile,
  type Card,
  type EnvironmentStepResult,
  type Game,
  type GameId,
  type GamePhase,
  type NextActionResult,
  type Player,
  type Position,
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

function presentPosition(position: Position, direction: Direction): PositionPayload {
  return { coordinate: position, orientation: orientations[direction] }
}

function presentRobotState(robot: NextActionResult['pushedRobots'][number]): RobotActionResolved['pushedRobots'][number] {
  return { robotId: robot.robotId, position: presentPosition(robot.position, robot.direction) }
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
    ...(tile instanceof GearTile ? { rotation: tile.rotation } : {}),
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
      position: presentPosition(game.board.positionOf(player.robot.id), player.robot.direction),
    })),
    phase: phases[game.phase],
    execution: game.executionState,
    paused: game.paused,
    aborted: game.aborted,
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
    instruction: action.card.instruction,
    position: presentPosition(action.position, action.direction),
    pushedRobots: result.pushedRobots.map(presentRobotState),
  }
}

export function presentEnvironmentStepResolved(
  gameId: GameId,
  result: EnvironmentStepResult,
): EnvironmentStepResolved {
  return {
    ...result,
    gameId,
    robots: result.robots.map(presentRobotState),
  }
}
