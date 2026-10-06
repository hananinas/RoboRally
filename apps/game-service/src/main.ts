import { createServer } from 'node:http'
import { parseGameServicePort } from '@/config'
import { createGameSocketServer } from '@/gameServer'

const host = '127.0.0.1'
const port = parseGameServicePort(process.env.PORT)
const httpServer = createServer()
const io = createGameSocketServer(httpServer)

httpServer.listen(port, host, () => {
  console.log(`Game Service listening at http://${host}:${port}`)
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
