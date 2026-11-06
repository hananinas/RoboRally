import { defineConfig } from '@playwright/test'
import { GAME_SERVICE_URL } from './tests/game-fixture-data.ts'

const baseURL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
    testIgnore: ['**/membership.e2e.ts', '**/reconnection.e2e.ts', '**/rounds.e2e.ts', '**/pushing-multiplayer.e2e.ts', '**/winning.e2e.ts'],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: [
    {
      command: 'pnpm exec tsx tests/socket-server.ts',
      url: `${GAME_SERVICE_URL}/health`,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4173 --strictPort',
      env: {
        GAME_SERVICE_URL,
      },
      reuseExistingServer: false,
      url: baseURL,
    },
  ],
})
