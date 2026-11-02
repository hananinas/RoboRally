import type { Instruction } from './instructions.js'

export type GameId = string
export type PlayerId = string
export type RobotId = string
export type CardId = string
export type UserId = string

export type User = Readonly<{
  userId: UserId
  username: string
}>

export type LeaveGame = Readonly<{ gameId: GameId }>

export type PlayerAssignment = Readonly<{
  gameId: GameId
  playerId: PlayerId
  robotId: RobotId
}>

export type Card = Readonly<{
  id: CardId
  instruction: Instruction
}>

export type Orientation = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'

export type Coordinate = Readonly<{
  x: number
  y: number
}>

export type Position = Readonly<{
  coordinate: Coordinate
  orientation: Orientation
}>

export type Robot = Readonly<{
  robotId: RobotId
  playerId: PlayerId
  colour: string
  position: Position
}>

export type Tile = Readonly<{
  position: Coordinate
  type: 'EMPTY' | 'PIT'
  walls?: readonly Orientation[]
  checkpointNumber?: number
}>

export type Board = Readonly<{
  width: number
  height: number
  tiles: readonly Tile[]
}>

export type GamePhase = 'PROGRAMMING' | 'EXECUTING'

export type EnvironmentStepKind = 'CHECKPOINTS'

export type ActivationCursor =
  | Readonly<{ stage: 'ROBOTS'; registerIndex: number }>
  | Readonly<{
    stage: 'ENVIRONMENT'
    registerIndex: number
    stepIndex: number
    kind: EnvironmentStepKind
  }>

export type ExecutionState = Readonly<{
  roundNumber: number
  lastEnvironmentSequence: number
  activation: ActivationCursor | null
}>

export type Antenna = Readonly<Coordinate & { angle: number }>

export type PublicGameState = Readonly<{
  gameId: GameId
  checkpointCount: number
  antenna: Antenna
  board: Board
  robots: readonly Robot[]
  phase: GamePhase
  execution?: ExecutionState
  players: readonly PlayerState[]
  paused: boolean
  aborted: boolean
}>

export type PlayerState = Readonly<{
  playerId: PlayerId
  lastCheckpoint: number
  username: string
  programSubmitted: boolean
  connected: boolean
}>

export type PlayerLeft = Readonly<{ gameId: GameId; playerId: PlayerId; robotId: RobotId }>

export type GameAborted = Readonly<{ gameId: GameId }>
export type PlayerCheckpointProgress = Readonly<{
  gameId: GameId
  playerId: PlayerId
  lastCheckpoint: number
  checkpointCount: number
}>

export type PlayerConnectionChanged = Readonly<{
  gameId: GameId
  playerId: PlayerId
  connected: boolean
  paused: boolean
}>

export type LeaveResult = Readonly<{
  outcome: 'LEFT' | 'INVALID_REQUEST' | 'GAME_NOT_FOUND' | 'INTERNAL_ERROR'
}>

export type CardsDealt = Readonly<{
  gameId: GameId
  playerId: PlayerId
  cards: readonly Card[]
}>

export type ProgramResultOutcome =
  | 'ACCEPTED'
  | 'INVALID_PROGRAM'
  | 'GAME_PAUSED'
  | 'GAME_ABORTED'
  | 'ALREADY_SUBMITTED'
  | 'WRONG_PHASE'
  | 'NOT_A_MEMBER'
  | 'INVALID_REQUEST'
  | 'GAME_ID_MISMATCH'
  | 'PLAYER_ID_MISMATCH'
  | 'PLAYER_NOT_IN_GAME'
  | 'INTERNAL_ERROR'

export type ProgramResult = Readonly<{
  outcome: ProgramResultOutcome
}>

export type ProgramSubmitted = Readonly<{
  gameId: GameId
  playerId: PlayerId
}>

export type RobotActionResolved = Readonly<{
  gameId: GameId
  registerIndex: number
  robotId: RobotId
  instruction: Instruction
  position: Position
  pushedRobots: readonly Pick<Robot, 'robotId' | 'position'>[]
}>

export type EnvironmentStepResolved = Readonly<{
  gameId: GameId
  roundNumber: number
  registerIndex: number
  stepIndex: number
  kind: EnvironmentStepKind
  sequence: number
  robots: readonly Pick<Robot, 'robotId' | 'position'>[]
  checkpointProgress: readonly Pick<PlayerState, 'playerId' | 'lastCheckpoint'>[]
}>

export type GameInitialization = Readonly<{
  outcome: 'JOINED'
  assignment: PlayerAssignment
  state: PublicGameState
  hand: readonly Card[]
  programSubmitted: boolean
}>
