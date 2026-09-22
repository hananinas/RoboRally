import type {
  CardsDealt,
  GetPublicGameState,
  PhaseChanged,
  ProgramResult,
  ProgramSubmitted,
  PublicGameStateResult,
  RobotActionResolved,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'

export type ProgramResultAcknowledgement = (result: ProgramResult) => void

export type PublicGameStateAcknowledgement = (
  result: PublicGameStateResult,
) => void

export interface ClientToServerEvents {
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
  'game.phaseChanged': (payload: PhaseChanged) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
}
