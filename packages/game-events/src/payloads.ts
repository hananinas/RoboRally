import type { Instruction } from './instructions.js'

export type { UpdateRegisters } from './updateRegisters.js'

export type GameId = string
export type PlayerId = string
export type RobotId = string
export type CardId = string
export type UserId = string

export type User = Readonly<{
  userId: UserId
  username: string
}>

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
  startPosition: Coordinate
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

export type Antenna = Readonly<Coordinate & { angle: number }>

export type PublicGameState = Readonly<{
  gameId: GameId
  checkpointCount: number
  antenna: Antenna
  board: Board
  robots: readonly Robot[]
  phase: GamePhase
  players: readonly PlayerState[]
  paused: boolean
  aborted: boolean
  winner : Winner | null
}>

export type PlayerState = Readonly<{
  playerId: PlayerId
  lastCheckpoint: number
  username: string
  programSubmitted: boolean
  connected: boolean
  registers: PublicRegisters
}>

export type PlayerLeft = Readonly<{ gameId: GameId; playerId: PlayerId; robotId: RobotId }>

export type GameAborted = Readonly<{ gameId: GameId }>
export type Winner = Readonly<{ playerId: PlayerId; username: string }>
export type GameWon = Readonly<{ gameId: GameId; playerId: PlayerId; username: string }>

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
  | 'GAME_FINISHED'
  | 'ALREADY_SUBMITTED'
  | 'WRONG_PHASE'
  | 'NOT_A_MEMBER'
  | 'INVALID_REQUEST'
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
  playerId: PlayerId
  instruction: Instruction
  position: Position
  pushedRobots: readonly Pick<Robot, 'robotId' | 'position'>[]
}>

export type PublicRegisterStatus = 'EMPTY' | 'HIDDEN' | 'REVEALED'

export type PublicRegisterSlot =
  | Readonly<{ status: 'EMPTY' }>
  | Readonly<{ status: 'HIDDEN' }>
  | Readonly<{ status: 'REVEALED'; instruction: Instruction }>

export type PublicRegisters = readonly [
  PublicRegisterSlot,
  PublicRegisterSlot,
  PublicRegisterSlot,
  PublicRegisterSlot,
  PublicRegisterSlot,
]

export type UpdateRegistersResult = Readonly<{
  outcome:
    | 'ACCEPTED'
    | 'INVALID_REQUEST'
    | 'NOT_A_MEMBER'
    | 'GAME_PAUSED'
    | 'GAME_ABORTED'
    | 'PLAYER_NOT_IN_GAME'
    | 'GAME_FINISHED'
    | 'WRONG_PHASE'
    | 'ALREADY_SUBMITTED'
    | 'INTERNAL_ERROR'
}>

type ProgrammingRegisterSlot = Readonly<{ status: 'EMPTY' | 'HIDDEN' }>

export type RegistersChanged = Readonly<{
  gameId: GameId
  playerId: PlayerId
  registers: readonly [
    ProgrammingRegisterSlot,
    ProgrammingRegisterSlot,
    ProgrammingRegisterSlot,
    ProgrammingRegisterSlot,
    ProgrammingRegisterSlot,
  ]
}>

export type GameInitialization = Readonly<{
  outcome: 'JOINED'
  assignment: PlayerAssignment
  state: PublicGameState
  hand: readonly Card[]
  programSubmitted: boolean
}>
