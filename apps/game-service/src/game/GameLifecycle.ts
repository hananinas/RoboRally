import { err, ok, type Result } from 'neverthrow'
import type { PlayerId } from '@/game/ids'

export type GamePhase = 'programming' | 'activation'

export type LifecycleState =
  | { kind: 'active'; phase: GamePhase }
  | { kind: 'paused'; resumePhase: GamePhase }
  | { kind: 'aborted' }
  | { kind: 'finished'; winnerId: PlayerId }

export type PauseError = 'ALREADY_PAUSED' | 'GAME_ABORTED' | 'GAME_FINISHED'
export type ResumeError = 'NOT_PAUSED' | 'GAME_ABORTED' | 'GAME_FINISHED'
export type AbortError = 'ALREADY_ABORTED' | 'GAME_FINISHED'
export type PhaseError = 'GAME_ABORTED' | 'GAME_FINISHED' | 'GAME_PAUSED' | 'WRONG_PHASE'

export class GameLifecycle {
  #state: LifecycleState
  #lastPhase: GamePhase

  constructor(initialPhase: GamePhase) {
    this.#state = { kind: 'active', phase: initialPhase }
    this.#lastPhase = initialPhase
  }

  get current(): LifecycleState {
    return { ...this.#state }
  }

  get lastPhase(): GamePhase {
    return this.#lastPhase
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
        this.#state = { kind: 'paused', resumePhase: this.#state.phase }
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
        this.#state = { kind: 'active', phase: this.#state.resumePhase }
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
      case 'paused':
        this.#state = { kind: 'aborted' }
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
    this.#lastPhase = 'activation'
  }

  enterProgramming(): void {
    if (this.#state.kind !== 'active' || this.#state.phase !== 'activation') {
      throw new Error(`Cannot enter programming from ${JSON.stringify(this.#state)}`)
    }
    this.#state = { kind: 'active', phase: 'programming' }
    this.#lastPhase = 'programming'
  }

  finish(winnerId: PlayerId): void {
    if (this.#state.kind !== 'active' || this.#state.phase !== 'activation') {
      throw new Error(`Cannot finish from ${JSON.stringify(this.#state)}`)
    }
    this.#state = { kind: 'finished', winnerId }
  }
}
