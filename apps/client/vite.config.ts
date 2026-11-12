import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

// e2e tests disconnect sockets on purpose; Vite's proxy logs that as an error.
const e2eLogger = createLogger()
const logError = e2eLogger.error.bind(e2eLogger)
e2eLogger.error = (msg, options) => {
  if (msg.includes('ws proxy error:') || msg.includes('ws proxy socket error:')) return
  logError(msg, options)
}

export default defineConfig({
  plugins: [react()],
  // Only set by the Playwright e2e harness, which runs the client without Caddy in front.
  ...(process.env.GAME_SERVICE_URL && { customLogger: e2eLogger }),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
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
