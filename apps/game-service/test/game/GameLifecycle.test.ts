import { describe, expect, it } from 'vitest'
import { GameLifecycle } from '@/game/GameLifecycle'

describe('GameLifecycle', () => {
  it('starts active in the given phase', () => {
    const lifecycle = new GameLifecycle('programming')
    expect(lifecycle.current).toEqual({ kind: 'active', phase: 'programming' })
    expect(lifecycle.lastPhase).toBe('programming')
  })

  describe('requirePhase', () => {
    it('accepts the matching phase while active', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.requirePhase('programming')._unsafeUnwrap()
    })

    it('rejects a different phase while active', () => {
      const lifecycle = new GameLifecycle('programming')
      expect(lifecycle.requirePhase('activation')._unsafeUnwrapErr()).toBe('WRONG_PHASE')
    })

    it('rejects any phase while paused, aborted, or finished', () => {
      const paused = new GameLifecycle('programming')
      paused.pause()
      expect(paused.requirePhase('programming')._unsafeUnwrapErr()).toBe('GAME_PAUSED')

      const aborted = new GameLifecycle('programming')
      aborted.abort()
      expect(aborted.requirePhase('programming')._unsafeUnwrapErr()).toBe('GAME_ABORTED')

      const finished = new GameLifecycle('activation')
      finished.finish('player-1')
      expect(finished.requirePhase('activation')._unsafeUnwrapErr()).toBe('GAME_FINISHED')
    })
  })

  describe('pause', () => {
    it('moves from active to paused, remembering the phase', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.pause()._unsafeUnwrap()
      expect(lifecycle.current).toEqual({ kind: 'paused', lastPhase: 'activation' })
    })

    it('rejects pausing an already-paused game', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.pause()
      expect(lifecycle.pause()._unsafeUnwrapErr()).toBe('ALREADY_PAUSED')
    })

    it('rejects pausing an aborted game', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.abort()
      expect(lifecycle.pause()._unsafeUnwrapErr()).toBe('GAME_ABORTED')
    })

    it('rejects pausing a finished game', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.finish('player-1')
      expect(lifecycle.pause()._unsafeUnwrapErr()).toBe('GAME_FINISHED')
    })
  })

  describe('resume', () => {
    it('moves from paused back to active, restoring the remembered phase', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.pause()
      lifecycle.resume()._unsafeUnwrap()
      expect(lifecycle.current).toEqual({ kind: 'active', phase: 'activation' })
    })

    it('rejects resuming a game that was never paused', () => {
      const lifecycle = new GameLifecycle('programming')
      expect(lifecycle.resume()._unsafeUnwrapErr()).toBe('NOT_PAUSED')
    })

    it('rejects resuming an aborted game', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.pause()
      lifecycle.abort()
      expect(lifecycle.resume()._unsafeUnwrapErr()).toBe('GAME_ABORTED')
    })

    it('rejects resuming a finished game', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.finish('player-1')
      expect(lifecycle.resume()._unsafeUnwrapErr()).toBe('GAME_FINISHED')
    })
  })

  describe('abort', () => {
    it('moves from active to aborted', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.abort()._unsafeUnwrap()
      expect(lifecycle.current).toEqual({ kind: 'aborted', lastPhase: 'programming' })
    })

    it('moves from paused to aborted', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.pause()
      lifecycle.abort()._unsafeUnwrap()
      expect(lifecycle.current).toEqual({ kind: 'aborted', lastPhase: 'programming' })
    })

    it('rejects aborting an already-aborted game', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.abort()
      expect(lifecycle.abort()._unsafeUnwrapErr()).toBe('ALREADY_ABORTED')
    })

    it('rejects aborting a finished game', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.finish('player-1')
      expect(lifecycle.abort()._unsafeUnwrapErr()).toBe('GAME_FINISHED')
    })
  })

  describe('enterActivation', () => {
    it('moves from programming to activation while active', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.enterActivation()
      expect(lifecycle.current).toEqual({ kind: 'active', phase: 'activation' })
      expect(lifecycle.lastPhase).toBe('activation')
    })

    it('throws when already in activation', () => {
      const lifecycle = new GameLifecycle('activation')
      expect(() => lifecycle.enterActivation()).toThrow()
    })

    it('throws when not active', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.pause()
      expect(() => lifecycle.enterActivation()).toThrow()
    })
  })

  describe('enterProgramming', () => {
    it('moves from activation to programming while active', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.enterProgramming()
      expect(lifecycle.current).toEqual({ kind: 'active', phase: 'programming' })
      expect(lifecycle.lastPhase).toBe('programming')
    })

    it('throws when already in programming', () => {
      const lifecycle = new GameLifecycle('programming')
      expect(() => lifecycle.enterProgramming()).toThrow()
    })

    it('throws when not active', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.pause()
      expect(() => lifecycle.enterProgramming()).toThrow()
    })
  })

  describe('finish', () => {
    it('moves from activation to finished, recording the winner', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.finish('player-1')
      expect(lifecycle.current).toEqual({ kind: 'finished', winnerId: 'player-1', lastPhase: 'activation' })
    })

    it('throws when not in activation', () => {
      const lifecycle = new GameLifecycle('programming')
      expect(() => lifecycle.finish('player-1')).toThrow()
    })

    it('throws when not active', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.pause()
      expect(() => lifecycle.finish('player-1')).toThrow()
    })
  })

  describe('lastPhase', () => {
    it('keeps the last real phase across pausing', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.pause()
      expect(lifecycle.lastPhase).toBe('activation')
    })

    it('keeps the last real phase across aborting', () => {
      const lifecycle = new GameLifecycle('programming')
      lifecycle.abort()
      expect(lifecycle.lastPhase).toBe('programming')
    })

    it('keeps the last real phase across finishing', () => {
      const lifecycle = new GameLifecycle('activation')
      lifecycle.finish('player-1')
      expect(lifecycle.lastPhase).toBe('activation')
    })
  })
})
