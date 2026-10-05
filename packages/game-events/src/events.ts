import type {
  CardsDealt,
  GetPublicGameState,
  JoinGame,
  JoinResult,
  LobbyCreateResult,
  LobbyJoinResult,
  LobbyListResult,
  LobbySummary,
  LoginResult,
  ProgramResult,
  ProgramSubmitted,
  PublicGameStateResult,
  RobotActionResolved,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'
import type { Login } from './login.js'
import type { CreateLobby, JoinLobby } from './lobby.js'

export type JoinResultAcknowledgement = (result: JoinResult) => void
export type ProgramResultAcknowledgement = (result: ProgramResult) => void
export type LoginAcknowledgement = (result: LoginResult) => void
export type LobbyListAcknowledgement = (result: LobbyListResult) => void
export type LobbyCreateAcknowledgement = (result: LobbyCreateResult) => void
export type LobbyJoinAcknowledgement = (result: LobbyJoinResult) => void

export type PublicGameStateAcknowledgement = (
  result: PublicGameStateResult,
) => void

export interface ClientToServerEvents {
  'game.join': (payload: JoinGame, acknowledge: JoinResultAcknowledgement) => void
  'user.login': (payload: Login, acknowledge: LoginAcknowledgement) => void
  'lobby.list': (acknowledge: LobbyListAcknowledgement) => void
  'lobby.create': (payload: CreateLobby, acknowledge: LobbyCreateAcknowledgement) => void
  'lobby.join': (payload: JoinLobby, acknowledge: LobbyJoinAcknowledgement) => void
  'program.submit': (
    payload: SubmitProgram,
    acknowledge: ProgramResultAcknowledgement,
  ) => void
  'game.getPublicGameState': (
    payload: GetPublicGameState,
    acknowledge: PublicGameStateAcknowledgement,
  ) => void
}

export interface ServerToClientEvents {
  'lobby.listUpdated': (lobbies: readonly LobbySummary[]) => void
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
}
