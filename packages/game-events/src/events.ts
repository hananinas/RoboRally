import type {
  CardsDealt,
  GetPublicGameState,
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

export interface ClientToServerEvents {
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
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
}
