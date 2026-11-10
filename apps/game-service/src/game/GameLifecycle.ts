import { err, ok, type Result } from 'neverthrow'
import type { PlayerId } from '@/game/ids'

export type GamePhase = 'programming' | 'activation'

export type LifecycleState =
  | { kind: 'active'; phase: GamePhase }
  | { kind: 'paused'; lastPhase: GamePhase }
  | { kind: 'aborted'; lastPhase: GamePhase }
  | { kind: 'finished'; winnerId: PlayerId; lastPhase: GamePhase }

export type PauseError = 'ALREADY_PAUSED' | 'GAME_ABORTED' | 'GAME_FINISHED'
export type ResumeError = 'NOT_PAUSED' | 'GAME_ABORTED' | 'GAME_FINISHED'
export type AbortError = 'ALREADY_ABORTED' | 'GAME_FINISHED'
export type PhaseError = 'GAME_ABORTED' | 'GAME_FINISHED' | 'GAME_PAUSED' | 'WRONG_PHASE'

export class GameLifecycle {
  #state: LifecycleState

  constructor(initialPhase: GamePhase) {
    this.#state = { kind: 'active', phase: initialPhase }
  }

  get isPaused(): boolean {
    return this.#state.kind === 'paused'
  }

  get isAborted(): boolean {
    return this.#state.kind === 'aborted'
  }

  get winnerId(): PlayerId | undefined {
    return this.#state.kind === 'finished' ? this.#state.winnerId : undefined
  }

  get lastPhase(): GamePhase {
    switch (this.#state.kind) {
      case 'active':
        return this.#state.phase
      case 'paused':
      case 'aborted':
      case 'finished':
        return this.#state.lastPhase
    }
  }

  requirePhase(phase: GamePhase): Result<void, PhaseError> {
    switch (this.#state.kind) {
      case 'active':
        return this.#state.phase === phase ? ok(undefined) : err('WRONG_PHASE')
      case 'paused':
        return err('GAME_PAUSED')
      case 'aborted':
        return err('GAME_ABORTED')
      case 'finished':
        return err('GAME_FINISHED')
    }
  }

  pause(): Result<void, PauseError> {
    switch (this.#state.kind) {
      case 'active':
        this.#state = { kind: 'paused', lastPhase: this.#state.phase }
        return ok(undefined)
      case 'paused':
        return err('ALREADY_PAUSED')
      case 'aborted':
        return err('GAME_ABORTED')
      case 'finished':
        return err('GAME_FINISHED')
    }
  }

  resume(): Result<void, ResumeError> {
    switch (this.#state.kind) {
      case 'paused':
        this.#state = { kind: 'active', phase: this.#state.lastPhase }
        return ok(undefined)
      case 'active':
        return err('NOT_PAUSED')
      case 'aborted':
        return err('GAME_ABORTED')
      case 'finished':
        return err('GAME_FINISHED')
    }
  }

  abort(): Result<void, AbortError> {
    switch (this.#state.kind) {
      case 'active':
        this.#state = { kind: 'aborted', lastPhase: this.#state.phase }
        return ok(undefined)
      case 'paused':
        this.#state = { kind: 'aborted', lastPhase: this.#state.lastPhase }
        return ok(undefined)
      case 'aborted':
        return err('ALREADY_ABORTED')
      case 'finished':
        return err('GAME_FINISHED')
    }
  }

  enterActivation(): void {
    if (this.#state.kind !== 'active' || this.#state.phase !== 'programming') {
      throw new Error(`Cannot enter activation from ${JSON.stringify(this.#state)}`)
    }
    this.#state = { kind: 'active', phase: 'activation' }
  }

  enterProgramming(): void {
    if (this.#state.kind !== 'active' || this.#state.phase !== 'activation') {
      throw new Error(`Cannot enter programming from ${JSON.stringify(this.#state)}`)
    }
    this.#state = { kind: 'active', phase: 'programming' }
  }

  finish(winnerId: PlayerId): void {
    if (this.#state.kind !== 'active' || this.#state.phase !== 'activation') {
      throw new Error(`Cannot finish from ${JSON.stringify(this.#state)}`)
    }
    this.#state = { kind: 'finished', winnerId, lastPhase: this.#state.phase }
  }
}
