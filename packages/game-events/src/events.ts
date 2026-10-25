import type {
  CardsDealt,
  GameAborted,
  GameStarted,
  GameUpdated,
  LeaveGame,
  LeaveResult,
  LobbyJoinResult,
  LobbyLeaveResult,
  LobbyListResult,
  LobbyStartResult,
  LobbyUpdated,
  LoginResult,
  ProgramResult,
  ProgrammingStarted,
  ProgramSubmitted,
  RobotActionResolved,
  PlayerJoined,
  PlayerLeft,
  PlayerConnectionChanged,
  PlayerCheckpointProgress,
  SessionResult,
  UpdateRegistersResult,
} from './payloads.js'
import type { EmptyRequest, LobbyRequest } from './lifecycle.js'
import type { SubmitProgram } from './submitProgram.js'
import type { UpdateRegisters } from './updateRegisters.js'
import type { Login } from './login.js'

export type ProgramResultAcknowledgement = (result: ProgramResult) => void
export type LoginAcknowledgement = (result: LoginResult) => void

export interface ClientToServerEvents {
  'user.login': (payload: Login, acknowledge: LoginAcknowledgement) => void
  'session.get': (payload: EmptyRequest, acknowledge: (result: SessionResult) => void) => void
  'lobby.list': (payload: EmptyRequest, acknowledge: (result: LobbyListResult) => void) => void
  'lobby.create': (payload: EmptyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.join': (payload: LobbyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.leave': (payload: LobbyRequest, acknowledge: (result: LobbyLeaveResult) => void) => void
  'lobby.start': (payload: LobbyRequest, acknowledge: (result: LobbyStartResult) => void) => void
  'game.leave': (payload: LeaveGame, acknowledge: (result: LeaveResult) => void) => void
  'game.updateRegisters': (payload: UpdateRegisters, acknowledge: (result: UpdateRegistersResult) => void) => void
  'program.submit': (
    payload: SubmitProgram,
    acknowledge: ProgramResultAcknowledgement,
  ) => void
}

export interface ServerToClientEvents {
  'lobby.updated': (payload: LobbyUpdated) => void
  'game.started': (payload: GameStarted) => void
  'game.updated': (payload: GameUpdated) => void
  'game.programmingStarted': (payload: ProgrammingStarted) => void
  'player.checkpointProgress': (payload: PlayerCheckpointProgress) => void
  'game.playerJoined': (payload: PlayerJoined) => void
  'game.playerLeft': (payload: PlayerLeft) => void
  'game.playerConnectionChanged': (payload: PlayerConnectionChanged) => void
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
  'game.aborted': (payload: GameAborted) => void
}
