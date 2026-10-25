import { defineConfig } from '@playwright/test'
import { GAME_SERVICE_URL } from './tests/real-game-fixture.ts'

const baseURL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './tests',
  testMatch: ['membership.e2e.ts', 'reconnection.e2e.ts', 'rounds.e2e.ts'],
  // Each test spawns its own game-service instance bound to the same fixed port,
  // so tests must run one at a time to avoid port conflicts.
  workers: 1,
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4175 --strictPort',
      env: { GAME_SERVICE_URL },
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
})
