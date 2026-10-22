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
}>

export type PlayerState = Readonly<{
  playerId: PlayerId
  lastCheckpoint: number
  username: string
  programSubmitted: boolean
  connected: boolean
  registers: PublicRegisters
}>

export type PlayerJoined = Readonly<{
  gameId: GameId
  player: PlayerState
  robot: Robot
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
  playerId: PlayerId
  instruction: Instruction
  position: Position
}>

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
    | 'PLAYER_ID_MISMATCH'
    | 'WRONG_PHASE'
    | 'ALREADY_SUBMITTED'
    | 'INTERNAL_ERROR'
}>

export type RegistersChanged = Readonly<{
  gameId: GameId
  playerId: PlayerId
  registers: PublicRegisters
}>

export type ProgrammingStarted = Readonly<{ gameId: GameId }>

export type JoinAccepted = Readonly<{
  outcome: 'JOINED'
  assignment: PlayerAssignment
  state: PublicGameState
  hand: readonly Card[]
  programSubmitted: boolean
}>

export type JoinResult = JoinAccepted

export type LobbyId = string

export type LobbySummary = Readonly<{
  lobbyId: LobbyId
  name: string
  playerCount: number
  maxPlayers: number
}>

export type LobbyState = Readonly<LobbySummary & { ownerUserId: UserId }>

export type LobbyFailure = Readonly<{
  outcome:
    | 'LOGIN_REQUIRED'
    | 'INVALID_REQUEST'
    | 'INTERNAL_ERROR'
    | 'LOBBY_NOT_FOUND'
    | 'NOT_LOBBY_MEMBER'
    | 'NOT_LOBBY_OWNER'
    | 'LOBBY_FULL'
    | 'USER_ALREADY_IN_SESSION'
}>

export type LobbyListResult =
  | Readonly<{ outcome: 'LOBBIES_FOUND'; lobbies: readonly LobbySummary[] }>
  | LobbyFailure

export type LobbyJoinResult =
  | Readonly<{ outcome: 'LOBBY_JOINED'; lobby: LobbyState }>
  | LobbyFailure

export type LobbyLeaveResult = Readonly<{ outcome: 'LEFT' }> | LobbyFailure

export type LobbyStartResult =
  | Readonly<{ outcome: 'STARTED'; gameId: GameId }>
  | LobbyFailure

export type SessionResult =
  | Readonly<{ outcome: 'NO_SESSION' }>
  | Readonly<{ outcome: 'IN_LOBBY'; lobby: LobbyState }>
  | Readonly<{ outcome: 'IN_GAME'; initialization: JoinAccepted }>
  | LobbyFailure

export type LobbyUpdated = Readonly<{ lobby: LobbyState }>
export type GameStarted = Readonly<{
  lobbyId: LobbyId
  initialization: JoinAccepted
}>
