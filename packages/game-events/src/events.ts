import type { CreateLobbyRequest, EmptyRequest, LobbyRequest, RobotSelectionRequest, LobbyState, LobbyListResult, LobbyJoinResult, LobbyLeaveResult, LobbyStartResult, RobotSelectionResult, MembershipResult } from './lobby.js'
import type {
  CardsDealt,
  ClockResult,
  GameAborted,
  GameWon,
  GameInitialization,
  ProgramResult,
  ProgramSubmitted,
  ProgramFinalized,
  ProgramTimerChanged,
  RobotActionResolved,
  EnvironmentStepResolved,
  PlayerLeft,
  PlayerConnectionChanged,
  LeaveResult,
  RegistersChanged,
  UpdateRegisters,
  UpdateRegistersResult,
} from './payloads.js'
import type { SubmitProgram } from './submitProgram.js'
import type { Vote, VoteResult, VotesChanged } from './vote.js'

export type ProgramResultAcknowledgement = (result: ProgramResult) => void

export interface ClientToServerEvents {
  'clock.get': (payload: EmptyRequest, acknowledge: (result: ClockResult) => void) => void
  'lobby.list': (payload: EmptyRequest, acknowledge: (result: LobbyListResult) => void) => void
  'lobby.create': (payload: CreateLobbyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.join': (payload: LobbyRequest, acknowledge: (result: LobbyJoinResult) => void) => void
  'lobby.selectRobot': (payload: RobotSelectionRequest, acknowledge: (result: RobotSelectionResult) => void) => void
  'lobby.leave': (payload: EmptyRequest, acknowledge: (result: LobbyLeaveResult) => void) => void
  'lobby.start': (payload: EmptyRequest, acknowledge: (result: LobbyStartResult) => void) => void
  'membership.get': (payload: EmptyRequest, acknowledge: (result: MembershipResult) => void) => void
  'game.vote': (payload: Vote, acknowledge: (result: VoteResult) => void) => void
  'game.leave': (payload: EmptyRequest, acknowledge: (result: LeaveResult) => void) => void
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
  'game.votesChanged': (payload: VotesChanged) => void
  'game.playerLeft': (payload: PlayerLeft) => void
  'game.playerConnectionChanged': (payload: PlayerConnectionChanged) => void
  'cards.dealt': (payload: CardsDealt) => void
  'program.submitted': (payload: ProgramSubmitted) => void
  'program.finalized': (payload: ProgramFinalized) => void
  'program.timerChanged': (payload: ProgramTimerChanged) => void
  'environment.stepResolved': (payload: EnvironmentStepResolved) => void
  'robot.actionResolved': (payload: RobotActionResolved) => void
  'game.aborted': (payload: GameAborted) => void
  'game.won': (payload: GameWon) => void
}
