import type {
  Card as CardPayload,
  CardsDealt,
  GamePhase as GamePhasePayload,
  Instruction,
  Orientation,
  PhaseChanged,
  PublicGameState,
  RobotActionResolved,
  Tile as TilePayload,
} from '@robo-rally/game-events'
import {
  Direction,
  EmptyTile,
  Move1,
  TurnLeft,
  type Card,
  type Game,
  type GameId,
  type GamePhase,
  type NextActionResult,
  type Player,
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

function instructionFor(card: Card): Instruction {
  if (card instanceof Move1) return 'MOVE_1'
  if (card instanceof TurnLeft) return 'TURN_LEFT'
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
  usernameForPlayer: (playerId: string) => string = (id) => id,
): PublicGameState {
  const tiles = Array.from({ length: game.board.height }, (_, y) =>
    Array.from({ length: game.board.width }, (_, x) => presentTile(game, x, y)),
  ).flat()

  return {
    gameId,
    roundNumber: game.roundNumber,
    antenna: game.antenna,
    board: {
      width: game.board.width,
      height: game.board.height,
      tiles,
    },
    players: game.players.map((player) => ({
      playerId: player.id,
      username: usernameForPlayer(player.id),
      programSubmitted: game.hasSubmittedProgram(player.id),
      participatesInRound: game.participatesInRound(player.id),
    })),
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

export function presentPhaseChanged(gameId: GameId, game: Game): PhaseChanged {
  return { gameId, roundNumber: game.roundNumber, phase: phases[game.phase] }
}

export function presentCardsDealt(
  gameId: GameId,
  roundNumber: number,
  player: Player,
): CardsDealt {
  return { gameId, roundNumber, playerId: player.id, cards: player.hand.map(presentCard) }
}

export function presentRobotActionResolved(
  gameId: GameId,
  result: NextActionResult,
): RobotActionResolved {
  const { action, roundNumber, registerIndex } = result
  return {
    gameId,
    roundNumber,
    registerIndex,
    robotId: action.robotId,
    instruction: instructionFor(action.card),
    position: {
      coordinate: action.position,
      orientation: orientations[action.direction],
    },
  }
}
