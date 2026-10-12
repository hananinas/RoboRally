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

export type LoginResult =
  | Readonly<{ outcome: 'LOGGED_IN'; user: User }>
  | Readonly<{
      outcome:
        | 'INVALID_USERNAME'
        | 'INVALID_REQUEST'
        | 'ALREADY_LOGGED_IN'
        | 'INTERNAL_ERROR'
    }>

export type JoinGame = Readonly<{ gameId: GameId }>

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
  position: Position
}>

export type Tile = Readonly<{
  position: Coordinate
  type: 'EMPTY'
  walls?: readonly Orientation[]
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
  antenna: Antenna
  board: Board
  robots: readonly Robot[]
  phase: GamePhase
  players: readonly PlayerState[]
  paused: boolean
}>

export type PlayerState = Readonly<{
  playerId: PlayerId
  username: string
  programSubmitted: boolean
  connected: boolean
}>

export type PlayerJoined = Readonly<{
  gameId: GameId
  player: PlayerState
  robot: Robot
}>

export type PlayerLeft = Readonly<{ gameId: GameId; playerId: PlayerId; robotId: RobotId }>

export type GameAborted = Readonly<{ gameId: GameId }>

export type PlayerConnectionChanged = Readonly<{
  gameId: GameId
  playerId: PlayerId
  connected: boolean
  paused: boolean
}>

export type LeaveResult = Readonly<{
  outcome: 'LEFT' | 'LOGIN_REQUIRED' | 'INVALID_REQUEST' | 'GAME_NOT_FOUND' | 'INTERNAL_ERROR'
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
}>

export type JoinResult =
  | Readonly<{
      outcome: 'JOINED'
      assignment: PlayerAssignment
      state: PublicGameState
      hand: readonly Card[]
      programSubmitted: boolean
    }>
  | Readonly<{
      outcome:
        | 'LOGIN_REQUIRED'
        | 'INVALID_REQUEST'
        | 'GAME_NOT_FOUND'
        | 'NO_SPAWN_AVAILABLE'
        | 'USER_ALREADY_IN_GAME'
        | 'GAME_ALREADY_STARTED'
        | 'INTERNAL_ERROR'
    }>
