import { beforeEach, vi } from 'vitest'

// Deck.draw is the only production use of Math.random. Fixing it to 0 makes every
// draw take the front of the remaining pile, so hands are deterministic across all tests.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
