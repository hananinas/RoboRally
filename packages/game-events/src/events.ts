import type {
  CardsDealt,
  GetPublicGameState,
  JoinGame,
  JoinResult,
  Login,
  LoginResult,
  ProgramResult,
  ProgramSubmitted,
  PublicGameStateResult,
  RobotActionResolved,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'

export type LoginResultAcknowledgement = (result: LoginResult) => void
export type JoinResultAcknowledgement = (result: JoinResult) => void
export type ProgramResultAcknowledgement = (result: ProgramResult) => void

export type PublicGameStateAcknowledgement = (
  result: PublicGameStateResult,
) => void

export interface ClientToServerEvents {
  'user.login': (
    payload: Login,
    acknowledge: LoginResultAcknowledgement,
  ) => void
  'game.join': (
    payload: JoinGame,
    acknowledge: JoinResultAcknowledgement,
  ) => void
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
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
}
