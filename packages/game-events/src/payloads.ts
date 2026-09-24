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

export type Instruction = 'MOVE_1' | 'TURN_LEFT'

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

export type PhaseChanged = Readonly<{
  gameId: GameId
  roundNumber: number
  phase: GamePhase
}>

export type PublicGameState = Readonly<{
  gameId: GameId
  roundNumber: number
  antenna: Antenna
  board: Board
  robots: readonly Robot[]
  players: readonly PublicPlayer[]
  phase: GamePhase
}>

export type CardsDealt = Readonly<{
  gameId: GameId
  roundNumber: number
  playerId: PlayerId
  cards: readonly Card[]
}>

export type ProgramResultOutcome = 'ACCEPTED' | 'INVALID_PROGRAM' | 'INTERNAL_ERROR'

export type ProgramResult = Readonly<{
  outcome: ProgramResultOutcome
}>

export type ProgramSubmitted = Readonly<{
  gameId: GameId
  roundNumber: number
  playerId: PlayerId
}>

export type RobotActionResolved = Readonly<{
  gameId: GameId
  roundNumber: number
  registerIndex: number
  robotId: RobotId
  instruction: Instruction
  position: Position
}>

export type GetPublicGameState = Readonly<{
  gameId: GameId
}>

export type PublicGameStateResult =
  | Readonly<{
      outcome: 'GAME_FOUND'
      state: PublicGameState
    }>
  | Readonly<{
      outcome: 'GAME_NOT_FOUND'
    }>

export type PublicPlayer = Readonly<{ playerId: PlayerId; username: string; programSubmitted: boolean; participatesInRound: boolean }>
export type JoinGame = Readonly<{ gameId: GameId }>
export type PlayerAssignment = Readonly<{ gameId: GameId; playerId: PlayerId; robotId: RobotId }>
export type JoinResult =
  | Readonly<{ outcome: 'JOINED'; assignment: PlayerAssignment; state: PublicGameState; hand: readonly Card[]; programSubmitted: boolean }>
  | Readonly<{ outcome: 'LOGIN_REQUIRED' | 'INVALID_REQUEST' | 'GAME_NOT_FOUND' | 'NO_SPAWN_AVAILABLE' | 'USER_ALREADY_IN_GAME' | 'ALREADY_IN_GAME' | 'INTERNAL_ERROR' }>
export type LeaveResult = Readonly<{ outcome: 'LEFT' | 'LOGIN_REQUIRED' | 'INVALID_REQUEST' | 'NOT_IN_GAME' }>
export type PlayerJoined = Readonly<{ gameId: GameId; roundNumber: number; player: PublicPlayer; robot: Robot }>
export type PlayerLeft = Readonly<{ gameId: GameId; roundNumber: number; playerId: PlayerId; robotId: RobotId }>
