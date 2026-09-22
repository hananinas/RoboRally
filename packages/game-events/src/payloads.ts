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

export type GamePhase = 'WAITING' | 'PROGRAMMING' | 'EXECUTING'

export type PublicGameState = Readonly<{
  gameId: GameId
  board: Board
  robots: readonly Robot[]
  phase: GamePhase
}>

export type CardsDealt = Readonly<{
  cards: readonly Card[]
}>

export type ProgramResultOutcome = 'ACCEPTED' | 'INVALID_PROGRAM'

export type ProgramResult = Readonly<{
  outcome: ProgramResultOutcome
}>

export type ProgramSubmitted = Readonly<{
  playerId: PlayerId
}>

export type RobotActionResolved = Readonly<{
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
