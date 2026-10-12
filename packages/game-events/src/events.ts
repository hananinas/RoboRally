import type {
  CardsDealt,
  GameAborted,
  JoinGame,
  JoinResult,
  LoginResult,
  ProgramResult,
  ProgramSubmitted,
  RobotActionResolved,
  PlayerJoined,
  PlayerLeft,
  PlayerConnectionChanged,
  LeaveResult,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'
import type { Login } from './login.js'

export type JoinResultAcknowledgement = (result: JoinResult) => void
export type ProgramResultAcknowledgement = (result: ProgramResult) => void
export type LoginAcknowledgement = (result: LoginResult) => void

export interface ClientToServerEvents {
  'game.leave': (payload: JoinGame, acknowledge: (result: LeaveResult) => void) => void
  'game.join': (payload: JoinGame, acknowledge: JoinResultAcknowledgement) => void
  'user.login': (payload: Login, acknowledge: LoginAcknowledgement) => void
  'program.submit': (
    payload: SubmitProgram,
    acknowledge: ProgramResultAcknowledgement,
  ) => void
}

export interface ServerToClientEvents {
  'game.playerJoined': (payload: PlayerJoined) => void
  'game.playerLeft': (payload: PlayerLeft) => void
  'game.playerConnectionChanged': (payload: PlayerConnectionChanged) => void
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
  'game.aborted': (payload: GameAborted) => void
}
