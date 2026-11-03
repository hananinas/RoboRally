import { defineConfig } from '@playwright/test'

const baseURL = 'https://127.0.0.1:3001'

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/membership.e2e.ts', '**/reconnection.e2e.ts', '**/rounds.e2e.ts', '**/pushing-multiplayer.e2e.ts'],
  globalTeardown: './tests/process-compose-teardown.ts',
  workers: 1,
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    // -n default excludes `game-service`; each test starts its own via the realGameService fixture.
    command: 'process-compose up -t=false -n default',
    cwd: '../..',
    // Playwright's readiness probe doesn't tolerate Caddy's self-signed cert on baseURL, so check
    // the client dev server directly (plain HTTP). process-compose.yaml makes `client` depend on
    // Kratos/Hydra being healthy, not just started, so this also guarantees the auth chain is up.
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
