import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CardsDealt, ClientToServerEvents, ServerToClientEvents, SubmitProgram } from '@robo-rally/game-events'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { expect, it } from 'vitest'
import { Board, Card, EmptyTile, Game } from '@/game/index.ts'
import { createGameSocketServer } from '@/socket/gameServer.ts'
import { Integer } from '@/numbers'

it('keeps programs private, broadcasts register-major actions, and resets before dealing each next round', async () => {
  const gameId = randomUUID()
  const board = new Board(Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => new EmptyTile())), { x: Integer(1), y: Integer(0), angle: Math.PI / 2 })
  const deck = Array.from({ length: 5 }, (_, index) =>
    new Card(`00000000-0000-4000-8000-00000000010${index}`, 'TURN_LEFT'))
  const game = new Game(board, [], deck, { x: Integer(0), y: Integer(0) })
  const httpServer = createServer()
  const server = createGameSocketServer(httpServer, () => ({ gameId, game }))
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  const events: { name: string; payload: unknown }[][] = [[], []]
  try {
    const listening = Promise.withResolvers<void>()
    httpServer.listen(0, '127.0.0.1', listening.resolve)
    await listening.promise
    const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
    for (let index = 0; index < 2; index++) {
      const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connectSocket(url, {
        transports: ['websocket'], autoConnect: false, reconnection: false,
      })
      clients.push(socket)
      socket.onAny((name, payload: unknown) => events[index].push({ name, payload }))
      const connected = Promise.withResolvers<void>()
      socket.once('connect', connected.resolve)
      socket.connect()
      await connected.promise
      await socket.timeout(1000).emitWithAck('user.login', { username: `Player ${index}` })
    }
    const created = await clients[0].timeout(1000).emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    expect(await clients[1].timeout(1000).emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId }))
      .toMatchObject({ outcome: 'LOBBY_JOINED' })
    const initializations = clients.map((socket) => {
      const started = Promise.withResolvers<Parameters<ServerToClientEvents['game.started']>[0]>()
      socket.once('game.started', started.resolve)
      return started.promise
    })
    expect(await clients[0].timeout(1000).emitWithAck('lobby.start', { lobbyId: created.lobby.lobbyId }))
      .toEqual({ outcome: 'STARTED', gameId })
    const started = await Promise.all(initializations)
    expect(started.map((event) => event.initialization.state.players.length)).toEqual([2, 2])
    const players = game.players
    for (let index = 0; index < players.length; index++) {
      const player = players[index]
      player.setHand(deck.map((_, cardIndex) => new Card(
        `00000000-0000-4000-8000-00000000${index + 2}${cardIndex.toString().padStart(3, '0')}`, 'TURN_LEFT',
      )))
      board.removeRobot(player.robot.id)
      board.placeRobot(player.robot.id, index === 0
        ? { x: Integer(0), y: Integer(2) }
        : { x: Integer(1), y: Integer(1) })
    }
    for (const socket of clients) await socket.timeout(1000).emitWithAck('session.get', {})
    events[0] = []
    events[1] = []

    for (const round of [1, 2]) {
      const submissions = players.map((player): SubmitProgram => ({
        gameId, playerId: player.id,
        cardIds: [player.hand[0].id, player.hand[1].id, player.hand[2].id, player.hand[3].id, player.hand[4].id],
      }))
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ACCEPTED' })
      // Session snapshots fence each connection's earlier event deliveries.
      for (const socket of clients) {
        expect(await socket.timeout(1000).emitWithAck('session.get', {}))
          .toMatchObject({ outcome: 'IN_GAME', initialization: { state: { phase: 'PROGRAMMING' } } })
      }
      expect(events[0]).toEqual([])
      expect(events[1]).toEqual([{
        name: 'program.submitted', payload: { gameId, playerId: players[0].id },
      }])
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ALREADY_SUBMITTED' })
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[1]))
        .toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
      const nextHands = clients.map((socket) => {
        const dealt = Promise.withResolvers<CardsDealt>()
        socket.once('cards.dealt', dealt.resolve)
        return dealt.promise
      })
      expect(await clients[1].timeout(1000).emitWithAck('program.submit', submissions[1]))
        .toEqual({ outcome: 'ACCEPTED' })
      const hands = await Promise.all(nextHands)
      for (const socket of clients) await socket.timeout(1000).emitWithAck('session.get', {})
      for (let index = 0; index < clients.length; index++) {
        expect(hands[index]).toMatchObject({ gameId, playerId: players[index].id })
        expect(events[index].map((event) => event.name)).toEqual([
          'program.submitted',
          ...Array.from({ length: 10 }, () => 'robot.actionResolved'),
          'game.programmingStarted', 'cards.dealt',
        ])
        expect(events[index][0].payload).toEqual({ gameId, playerId: players[1 - index].id })
        const firstActionIndex = events[index].findIndex((event) => event.name === 'robot.actionResolved')
        const beforeActions = JSON.stringify(events[index].slice(0, firstActionIndex))
        expect(beforeActions).not.toContain('instruction')
        for (const submission of submissions) {
          for (const cardId of submission.cardIds) expect(beforeActions).not.toContain(cardId)
        }
        expect(events[index].find((event) => event.name === 'game.programmingStarted')?.payload)
          .toEqual({ gameId })
        const actions = events[index].filter((event) => event.name === 'robot.actionResolved')
        expect(actions.map((event) => event.payload)).toEqual(
          Array.from({ length: 5 }, (_, registerIndex) => [1, 0].map((playerIndex) => ({
            gameId, registerIndex,
            playerId: players[playerIndex].id,
            pushedRobots: [],
            robotId: players[playerIndex].robot.id,
            instruction: 'TURN_LEFT',
            position: {
              coordinate: playerIndex === 0 ? { x: 0, y: 2 } : { x: 1, y: 1 },
              orientation: ['WEST', 'SOUTH', 'EAST', 'NORTH'][(registerIndex + round - 1) % 4],
            },
          }))).flat(),
        )
        expect(events[index].filter((event) => event.name === 'cards.dealt').map((event) => event.payload))
          .toEqual([hands[index]])
        events[index] = []
      }
      expect(game.phase).toBe('programming')
      expect(players.map((player) => player.robot.program)).toEqual([[], []])
    }
  } finally {
    for (const socket of clients) socket.disconnect()
    const closed = Promise.withResolvers<void>()
    void server.close(() => closed.resolve())
    await closed.promise
  }
})
