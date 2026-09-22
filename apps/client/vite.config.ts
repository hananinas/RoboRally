import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    proxy: {
      '/socket.io': {
        target: process.env.GAME_SERVICE_URL || 'http://127.0.0.1:3001',
        ws: true,
      },
    },
  },
})
