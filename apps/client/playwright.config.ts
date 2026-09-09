import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173 --strictPort',
    reuseExistingServer: !process.env.CI,
    url: baseURL,
  },
})
