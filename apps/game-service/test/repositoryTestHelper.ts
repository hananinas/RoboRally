import { vi } from 'vitest'
import type { GameRepository } from '@/infra/GameRepository'

// Socket-level tests care that a write was asked for, not what SQL it becomes;
// GameRepository.test.ts covers the SQL against a migrated database.
export function createFakeGameRepository() {
  return {
    saveRound: vi.fn(),
    saveFinished: vi.fn(),
    saveAborted: vi.fn(),
    markPlayerLeft: vi.fn(),
  } satisfies GameRepository
}
