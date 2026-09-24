import type {
  CardsDealt,
  LeaveResult,
  PlayerJoined,
  PlayerLeft,
  JoinGame,
  JoinResult,
  GetPublicGameState,
  PhaseChanged,
  LoginResult,
  ProgramResult,
  ProgramSubmitted,
  PublicGameStateResult,
  RobotActionResolved,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'
import type { Login } from './login.js'

export type ProgramResultAcknowledgement = (result: ProgramResult) => void
export type LoginAcknowledgement = (result: LoginResult) => void

export type PublicGameStateAcknowledgement = (
  result: PublicGameStateResult,
) => void

export type JoinResultAcknowledgement = (result: JoinResult) => void

export interface ClientToServerEvents {
  'game.leave': (payload: JoinGame, acknowledge: (result: LeaveResult) => void) => void
  'game.join': (payload: JoinGame, acknowledge: JoinResultAcknowledgement) => void
  'user.login': (payload: Login, acknowledge: LoginAcknowledgement) => void
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
  'game.playerJoined': (payload: PlayerJoined) => void
  'game.playerLeft': (payload: PlayerLeft) => void
  'cards.dealt': (payload: CardsDealt) => void
  'game.phaseChanged': (payload: PhaseChanged) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
}
