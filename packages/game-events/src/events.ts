import type { EmptyRequest, LobbyRequest, LobbyState, LobbyListResult, LobbyJoinResult, LobbyLeaveResult, LobbyStartResult, SessionResult } from './lobby.js'
import type {
  CardsDealt,
  GameAborted,
  LeaveGame,
  GameInitialization,
  LoginResult,
  ProgramResult,
  ProgramSubmitted,
  RobotActionResolved,
  PlayerJoined,
  PlayerLeft,
  PlayerConnectionChanged,
  PlayerCheckpointProgress,
  LeaveResult,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'
import type { Login } from './login.js'

export type ProgramResultAcknowledgement = (result: ProgramResult) => void
export type LoginAcknowledgement = (result: LoginResult) => void

export interface ClientToServerEvents {
  'lobby.list': (payload: EmptyRequest, acknowledge: (result: LobbyListResult) => void) => void
  'lobby.create': (payload: EmptyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.join': (payload: LobbyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.leave': (payload: LobbyRequest, acknowledge: (result: LobbyLeaveResult) => void) => void
  'lobby.start': (payload: LobbyRequest, acknowledge: (result: LobbyStartResult) => void) => void
  'session.get': (payload: EmptyRequest, acknowledge: (result: SessionResult) => void) => void
  'game.leave': (payload: LeaveGame, acknowledge: (result: LeaveResult) => void) => void
  'user.login': (payload: Login, acknowledge: LoginAcknowledgement) => void
  'program.submit': (
    payload: SubmitProgram,
    acknowledge: ProgramResultAcknowledgement,
  ) => void
}

export interface ServerToClientEvents {
  'lobby.updated': (payload: { lobby: LobbyState }) => void
  'game.started': (payload: { lobbyId: string; initialization: GameInitialization }) => void
  'player.checkpointProgress': (payload: PlayerCheckpointProgress) => void
  'game.playerJoined': (payload: PlayerJoined) => void
  'game.playerLeft': (payload: PlayerLeft) => void
  'game.playerConnectionChanged': (payload: PlayerConnectionChanged) => void
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
  'game.aborted': (payload: GameAborted) => void
}
