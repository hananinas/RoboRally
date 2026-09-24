import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', testMatch: '**/*.real.e2e.ts', workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4176', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'pnpm --dir ../game-service exec tsx src/main.ts', env: { PORT: '4175' }, url: 'http://127.0.0.1:4175/health', reuseExistingServer: false },
    { command: 'pnpm dev --host 127.0.0.1 --port 4176 --strictPort',
      env: { VITE_GAME_ID: '00000000-0000-4000-8000-000000000001', GAME_SERVICE_URL: 'http://127.0.0.1:4175' },
      url: 'http://127.0.0.1:4176', reuseExistingServer: false },
  ],
})
