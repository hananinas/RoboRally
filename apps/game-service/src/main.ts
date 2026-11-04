import { createServer } from 'node:http'
import { parseAppConfig } from '@/config'
import { createGameSocketServer } from '@/socket/gameServer'
import { createAuthApp } from '@/auth/httpRoutes'
import { createSessionStore } from '@/auth/sessionStore'
import { createOidcClient } from '@/infra/oidcClient'
import { logError } from '@/logger'

process.on('uncaughtExceptionMonitor', (error, origin) => {
  logError('Unhandled process error', error, { source: 'process', origin })
})

const host = '127.0.0.1'
const config = parseAppConfig(process.env)
const oidcClient = await createOidcClient(config.oidc)
const sessionStore = createSessionStore({ oidcClient, refreshBufferSeconds: config.oidc.refreshBufferSeconds })
const httpServer = createServer()
const authApp = createAuthApp({
  oidcClient,
  sessionStore,
  kratosSettingsUrl: config.kratosSettingsUrl,
  refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
})
httpServer.on('request', (req, res) => {
  if (req.url?.startsWith('/auth/')) {
    authApp(req, res)
  }
})
const io = createGameSocketServer(httpServer, sessionStore)

httpServer.listen(config.port, host, () => {
  console.log(`Game Service listening at http://${host}:${config.port}`)
})

let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  void io.close((error) => {
    if (!error) return
    console.error('Game Service failed to shut down cleanly', error)
    process.exitCode = 1
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
