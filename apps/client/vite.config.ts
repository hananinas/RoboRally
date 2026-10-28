import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Only set by the Playwright e2e harness, which runs the client without Caddy in front.
    ...(process.env.GAME_SERVICE_URL && {
      proxy: {
        '/socket.io': {
          target: process.env.GAME_SERVICE_URL,
          ws: true,
        },
      },
    }),
  },
})
