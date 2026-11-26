import type {
  Card as CardPayload,
  CardsDealt,
  EnvironmentStepResolved,
  GameInitialization,
  ProgramFinalized,
  ProgrammingTimer,
  ProgramTimerChanged,
  GamePhase as GamePhasePayload,
  Orientation,
  Position as PositionPayload,
  PlayerConnectionChanged,
  PublicGameState,
  RegistersChanged,
  User,
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
  type Position,
  type PlayerId,
} from '@/domain/game/index'
import { Integer } from '@/numbers'
import type { EnvironmentStepResult } from '@/domain/game/Game'
import { ConveyorTile, GearTile } from '@/domain/game/Tile'

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

function presentPosition(coordinate: Position, direction: Direction): PositionPayload {
  return { coordinate, orientation: orientations[direction] }
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

  if (tile instanceof GearTile) return { ...common, type: tile.kind, rotation: tile.rotation }

  if (tile.kind === 'EMPTY' || tile.kind === 'PIT' || tile.kind === 'REBOOT') {
    return {
      ...common,
      type: tile.kind,
    }
  }

  throw new Error(`Unsupported tile type at ${x},${y}: ${tile.kind}`)
}

export function presentPlayerState(game: Game, player: Player, username: string, connected: boolean): PlayerState {
  return {
    playerId: player.id,
    lastCheckpoint: player.lastCheckpoint,
    username,
    programSubmitted: game.hasSubmittedProgram(player.id),
    connected,
    registers: player.registers,
  }
}

export function presentWinner(playerId: PlayerId, username: string): Winner {
  return { playerId, username }
}

export function presentPublicGameState(
  game: Game,
  programmingTimer: ProgrammingTimer,
  memberships: Iterable<{ user: User; player: Player; connectionId: string | null }> = [],
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
    players: [...memberships].map(({ user, player, connectionId }) =>
      presentPlayerState(game, player, user.username, connectionId !== null)),
    antenna: game.board.antenna,
    board: {
      width: game.board.width,
      height: game.board.height,
      tiles,
    },
    robots: game.players.map((player) => ({
      robotId: player.robot.id,
      playerId: player.id,
      robotSpriteId: player.robot.robotSpriteId,
      colour: player.robot.colour,
      position: presentPosition(game.board.positionOf(player.robot.id), player.robot.direction),
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

export function presentInitialization(game: Game, player: Player, state: PublicGameState): GameInitialization {
  return {
    outcome: 'JOINED',
    assignment: { gameId: game.id, playerId: player.id, robotId: player.robot.id },
    state,
    hand: presentCardsDealt(game.id, player).cards,
    program: player.program,
    programSubmitted: game.hasSubmittedProgram(player.id),
  }
}

export function presentRegistersChanged(gameId: GameId, player: Player): RegistersChanged {
  return { gameId, playerId: player.id, registers: player.registers as RegistersChanged['registers'] }
}

export function presentPlayerConnectionChanged(game: Game, player: Player, connected: boolean): PlayerConnectionChanged {
  return { gameId: game.id, playerId: player.id, connected, paused: game.paused }
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
    position: presentPosition(action.position, action.direction),
    pushedRobots: result.pushedRobots.map((robot) => ({
      robotId: robot.robotId,
      position: presentPosition(robot.position, robot.direction),
    })),
    reboots: result.reboots.map(({ robotId, fellAt, landedAt }) => ({
      robotId,
      fellAt: { x: fellAt.x, y: fellAt.y },
      landedAt: { x: landedAt.x, y: landedAt.y },
    })),
  }
}

export function presentEnvironmentStepResolved(gameId: GameId, result: EnvironmentStepResult): EnvironmentStepResolved {
  const { kind } = result
  if (kind === 'CHECKPOINTS') return { gameId, kind, checkpointProgress: result.checkpointProgress }
  return {
    gameId, kind,
    robots: result.robots.map(({ robotId, position, direction }) => ({
      robotId,
      position: presentPosition(position, direction),
    })),
  }
}
