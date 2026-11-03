import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createSessionStore, SESSION_COOKIE_NAME } from '../../game-service/dist/auth/sessionStore.js'
import { parseGameServicePort } from '../../game-service/dist/config.js'
import { createGameSocketServer } from '../../game-service/dist/socket/gameServer.js'

export function startGameServer(createGame) {
  const server = createServer()
  const sessions = createSessionStore()
  const sessionId = sessions.create('browser-test', 'test-id-token', 3600)
  const io = createGameSocketServer(server, sessions, createGame)
  // Gameplay tests supply an authenticated session without an external identity provider.
  io.engine.use((request, _response, next) => {
    request.headers.cookie = `${SESSION_COOKIE_NAME}=${sessionId}`
    next()
  })
  const port = parseGameServicePort(process.env.PORT)
  server.listen(port, '127.0.0.1', () => {
    console.log(`Game Service listening at http://127.0.0.1:${port}`)
  })
  process.once('SIGTERM', () => io.close())
  process.once('SIGINT', () => io.close())
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startGameServer()
