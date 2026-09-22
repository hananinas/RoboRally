export type GameId = string
export type PlayerId = string
export type RobotId = string
export type CardId = string

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
  phase: GamePhase
}>

export type CardsDealt = Readonly<{
  gameId: GameId
  roundNumber: number
  playerId: PlayerId
  cards: readonly Card[]
}>

export type ProgramResultOutcome = 'ACCEPTED' | 'INVALID_PROGRAM'

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
