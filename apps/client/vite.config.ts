import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: process.env.GAME_SERVICE_URL ? {
      '/socket.io': {
        target: process.env.GAME_SERVICE_URL,
        ws: true,
      },
    } : undefined,
  },
})
