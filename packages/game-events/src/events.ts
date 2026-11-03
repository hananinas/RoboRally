import type { EmptyRequest, LobbyRequest, LobbyState, LobbyListResult, LobbyJoinResult, LobbyLeaveResult, LobbyStartResult, SessionResult } from './lobby.js'
import type {
  CardsDealt,
  GameAborted,
  LeaveGame,
  GameInitialization,
  ProgramResult,
  ProgramSubmitted,
  RobotActionResolved,
  PlayerLeft,
  PlayerConnectionChanged,
  PlayerCheckpointProgress,
  LeaveResult,
  RegistersChanged,
  UpdateRegisters,
  UpdateRegistersResult,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'

export type ProgramResultAcknowledgement = (result: ProgramResult) => void

export interface ClientToServerEvents {
  'lobby.list': (payload: EmptyRequest, acknowledge: (result: LobbyListResult) => void) => void
  'lobby.create': (payload: EmptyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.join': (payload: LobbyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.leave': (payload: LobbyRequest, acknowledge: (result: LobbyLeaveResult) => void) => void
  'lobby.start': (payload: LobbyRequest, acknowledge: (result: LobbyStartResult) => void) => void
  'session.get': (payload: EmptyRequest, acknowledge: (result: SessionResult) => void) => void
  'game.leave': (payload: LeaveGame, acknowledge: (result: LeaveResult) => void) => void
  'game.updateRegisters': (payload: UpdateRegisters, acknowledge: (result: UpdateRegistersResult) => void) => void
  'program.submit': (
    payload: SubmitProgram,
    acknowledge: ProgramResultAcknowledgement,
  ) => void
}

export interface ServerToClientEvents {
  'lobby.updated': (payload: { lobby: LobbyState }) => void
  'game.started': (payload: { lobbyId: string; initialization: GameInitialization }) => void
  'game.registersChanged': (payload: RegistersChanged) => void
  'player.checkpointProgress': (payload: PlayerCheckpointProgress) => void
  'game.playerLeft': (payload: PlayerLeft) => void
  'game.playerConnectionChanged': (payload: PlayerConnectionChanged) => void
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
  'game.aborted': (payload: GameAborted) => void
}
