import { defineConfig } from '@playwright/test'

const serviceURL = 'http://127.0.0.1:4176'
const baseURL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './tests',
  testMatch: 'membership.e2e.ts',
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm --dir ../game-service start',
      env: { PORT: '4176' },
      url: `${serviceURL}/socket.io/?EIO=4&transport=polling`,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4175 --strictPort',
      env: { GAME_SERVICE_URL: serviceURL, VITE_GAME_ID: '00000000-0000-4000-8000-000000000001' },
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
})
