export type Instruction = 'MOVE_1' | 'TURN_LEFT'

export type Card = Readonly<{
  id: string
  instruction: Instruction
}>

export type Orientation = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'

export type Coordinate = Readonly<{
  x: number
  y: number
}>

export type Position = Coordinate & Readonly<{
  orientation: Orientation
}>

export type Robot = Readonly<{
  robotId: string
  playerId: string
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
  gameId: string
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
  playerId: string
}>

export type RobotActionResolved = Readonly<{
  robotId: string
  instruction: Instruction
  position: Position
}>

export type GetPublicGameState = Readonly<{
  gameId: string
}>

export type PublicGameStateResult = PublicGameState
