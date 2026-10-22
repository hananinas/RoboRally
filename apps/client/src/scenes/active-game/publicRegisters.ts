import type { GameId, Instruction, PlayerId, PlayerState, RobotActionResolved } from '@robo-rally/game-events'

// PR #148's public-only contract; shared game-events types do not expose it yet.
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

export type PublicPlayerState = PlayerState & Readonly<{ registers: PublicRegisters }>

export type RegistersChanged = Readonly<{
  gameId: GameId
  playerId: PlayerId
  registers: PublicRegisters
}>

export type ProgrammingStarted = Readonly<{ gameId: GameId }>

export type PublicRobotActionResolved = RobotActionResolved & Readonly<{ playerId: PlayerId }>

export type PublicRegisterEvents = {
  'game.registersChanged': (payload: RegistersChanged) => void
  'game.programmingStarted': (payload: ProgrammingStarted) => void
}

// Presentation metadata is client-only, never part of PlayerState on the wire.
export type OpponentPlayer = PublicPlayerState & Readonly<{
  robotId: string
  colour: string
}>
