import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CardsDealt, ClientToServerEvents, RobotActionResolved, ServerToClientEvents, SubmitProgram } from '@robo-rally/game-events'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { expect, it, vi, type MockInstance } from 'vitest'
import { createGameSocketServer } from '@/socket/gameServer.ts'
import * as gameContext from '@/socket/gameContext.ts'
import { createSessionStore } from '@/auth/sessionStore.ts'
import { authCookieHeader } from './authTestHelper.ts'

it('waits for the roster, broadcasts register-major actions, and deals two private next rounds', async () => {
  const httpServer = createServer()
  const sessionStore = createSessionStore({
    oidcClient: { refreshToken: () => Promise.reject(new Error('not used in this test')) },
    refreshBufferSeconds: 0,
  })
  const contexts: MockInstance<typeof gameContext.createGameContext> = vi.spyOn(gameContext, 'createGameContext')
  const server = createGameSocketServer(httpServer, sessionStore)
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  const events: { name: string; payload: unknown }[][] = [[], []]
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
    const usernames = ['Bence', 'Dane']
    for (let index = 0; index < 2; index++) {
      const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connectSocket(url, {
        transports: ['websocket'], autoConnect: false, reconnection: false,
        extraHeaders: authCookieHeader(sessionStore, usernames[index], usernames[index]),
      })
      clients.push(socket)
      // Finalization routing and privacy are covered by the public-register tests.
      // Checkpoint progress is incidental here (random cards can wander onto one).
      const ignored = ['program.timerChanged', 'program.finalized', 'game.registersChanged', 'player.checkpointProgress']
      socket.onAny((name, payload: unknown) => {
        if (!ignored.includes(name)) events[index].push({ name, payload })
      })
      const connected = new Promise<void>((resolve) => socket.once('connect', resolve))
      socket.connect()
      await connected
    }
    const created = await clients[0].emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    await clients[1].emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId })
    await clients[0].emitWithAck('lobby.start', {})
    const game: ReturnType<typeof gameContext.createGameContext>['game'] = contexts.mock.results.at(-1)!.value.game
    const players = game.players
    const robotIds = players.map((player) => player.robot.id)

    for (const socket of clients) {
      await socket.timeout(1000).emitWithAck('session.get', {})
    }
    events[0] = []
    events[1] = []

    for (const _round of [1, 2]) {
      const submissions = players.map((player): SubmitProgram => ({
        cardIds: [player.hand[0].id, player.hand[1].id, player.hand[2].id, player.hand[3].id, player.hand[4].id],
      }))
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ACCEPTED' })
      // Session acknowledgements fence each connection's earlier deliveries.
      for (const socket of clients) {
        const waiting = await socket.timeout(1000).emitWithAck('session.get', {})
        expect(waiting).toMatchObject({ outcome: 'IN_GAME', initialization: { state: { phase: 'PROGRAMMING' } } })
      }
      expect(events[0].map((event) => event.name)).toEqual(['program.submitted'])
      expect(events[1].map((event) => event.name)).toEqual(['program.submitted'])
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ALREADY_SUBMITTED' })

      const nextHands = clients.map((socket) => new Promise<CardsDealt>((resolve) =>
        socket.once('cards.dealt', resolve)))
      expect(await clients[1].timeout(1000).emitWithAck('program.submit', submissions[1]))
        .toEqual({ outcome: 'ACCEPTED' })
      const hands = await Promise.all(nextHands)
      for (let index = 0; index < clients.length; index++) {
        expect(hands[index]).toMatchObject({ gameId: game.id, playerId: players[index].id })
        expect(events[index].map((event) => event.name)).toEqual([
          'program.submitted', 'program.submitted',
          ...Array.from({ length: 10 }, () => 'robot.actionResolved'),
          'cards.dealt',
        ])
        expect(events[index].filter((event) => event.name === 'program.submitted').map((event) => event.payload))
          .toEqual(players.map((player) => ({ gameId: game.id, playerId: player.id })))
        const actions = events[index].filter((event) => event.name === 'robot.actionResolved')
          .map((event) => event.payload as RobotActionResolved)
        // Register-major order: both robots act in every register before either acts in the next.
        expect(actions.map((action) => action.registerIndex)).toEqual(
          Array.from({ length: 5 }, (_, registerIndex) => [registerIndex, registerIndex]).flat(),
        )
        for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
          const pair = actions.slice(registerIndex * 2, registerIndex * 2 + 2)
          expect(new Set(pair.map((action) => action.robotId))).toEqual(new Set(robotIds))
          expect(new Set(pair.map((action) => action.playerId))).toEqual(new Set(players.map((player) => player.id)))
          for (const action of pair) expect(action.gameId).toBe(game.id)
        }
        // Each connection receives exactly one hand, for its own assignment.
        expect(events[index].filter((event) => event.name === 'cards.dealt').map((event) => event.payload))
          .toEqual([hands[index]])
        events[index] = []
      }
      expect(game.lastActivePhase).toBe('programming')
      expect(players.map((player) => player.robot.program)).toEqual([[], []])
    }
  } finally {
    for (const socket of clients) socket.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.restoreAllMocks()
  }
})
