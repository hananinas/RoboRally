import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ClientToServerEvents, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { expect, it, vi } from 'vitest'
import { createDefaultGame } from '@/game/SinglePlayerGame'
import { createGameSocketServer } from '@/gameServer'

it('isolates game state and broadcasts between contexts', async () => {
  const games = [createDefaultGame(), createDefaultGame()]
  const http = createServer()
  const server = createGameSocketServer(http, games)
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  try {
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
    for (const [index, game] of games.entries()) {
      const client: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { autoConnect: false })
      clients.push(client)
      const connected = new Promise<void>((resolve) => client.once('connect', resolve))
      client.connect()
      await connected
      await client.emitWithAck('user.login', { username: `Player ${index}` })
      expect((await client.emitWithAck('game.join', { gameId: game.gameId })).outcome).toBe('JOINED')
    }
    const foreignEvents = vi.fn()
    clients[1].onAny(foreignEvents)
    await clients[0].emitWithAck('game.leave', { gameId: games[0].gameId })
    await clients[1].emitWithAck('game.getPublicGameState', { gameId: games[1].gameId })
    expect(foreignEvents).not.toHaveBeenCalled()
    expect(games[0].game.players).toHaveLength(0)
    expect(games[1].game.players).toHaveLength(1)
    expect(games[0].game.board).not.toBe(games[1].game.board)
  } finally {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
