import type {
  Card as CardPayload,
  CardsDealt,
  ProgramFinalized,
  ProgrammingTimer,
  ProgramTimerChanged,
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
  type CompletedProgram,
  type Game,
  type GameId,
  type GamePhase,
  type NextActionResult,
  type Player,
} from '@/game/index'
import { Integer } from '@/numbers'
import { ConveyorTile } from '@/game/Tile'

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

  const common = {
    position: { x, y },
    ...(walls.length === 0 ? {} : { walls }),
    ...(tile.checkpointNumber === undefined
      ? {}
      : { checkpointNumber: tile.checkpointNumber }),
  }

  if (tile instanceof ConveyorTile) {
    return {
      ...common,
      type: tile.kind,
      sprite: tile.sprite,
      direction: orientations[tile.direction],
    }
  }

  if (tile.kind === 'EMPTY' || tile.kind === 'PIT') {
    return {
      ...common,
      type: tile.kind,
    }
  }

  throw new Error(`Unsupported tile type at ${x},${y}: ${tile.kind}`)
}

export function presentPublicGameState(
  game: Game,
  programmingTimer: ProgrammingTimer,
  players: readonly PlayerState[] = [],
  winner: Winner | null = null,
): PublicGameState {
  const tiles = Array.from({ length: game.board.height }, (_, y) =>
    Array.from({ length: game.board.width }, (_, x) => presentTile(game, x, y)),
  ).flat()

  return {
    gameId: game.id,
    serverTime: Date.now(),
    programmingTimer,
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
    })),
    phase: phases[game.lastActivePhase],
    paused: game.paused,
    aborted: game.aborted,
    winner,
  }
}

export function presentProgrammingTimer(gameId: GameId, timer: ProgrammingTimer): ProgramTimerChanged {
  return { gameId, serverTime: Date.now(), timer }
}

export function presentCardsDealt(
  gameId: GameId,
  player: Player,
): CardsDealt {
  return { gameId, playerId: player.id, cards: player.hand.map(presentCard) }
}

export function presentProgramFinalized(
  gameId: GameId,
  program: CompletedProgram,
  reason: ProgramFinalized['reason'],
): ProgramFinalized {
  const cards: readonly CardPayload[] = program.cards.map(presentCard)
  return { gameId, playerId: program.playerId, reason, cards: cards as ProgramFinalized['cards'] }
}

export function presentRobotActionResolved(
  game: Game,
  result: NextActionResult,
): RobotActionResolved {
  const { action, registerIndex } = result
  const player = game.players.find((candidate) => candidate.robot.id === action.robotId)
  if (!player) throw new Error(`Missing owner for robot ${action.robotId}`)
  return {
    gameId: game.id,
    registerIndex,
    robotId: action.robotId,
    playerId: player.id,
    instruction: action.card.instruction,
    resolvedInstruction: action.resolvedInstruction ?? null,
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
