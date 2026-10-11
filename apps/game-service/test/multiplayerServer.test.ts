import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CardsDealt, ClientToServerEvents, ServerToClientEvents, SubmitProgram } from '@robo-rally/game-events'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { expect, it } from 'vitest'
import { Board, Card, EmptyTile, Game, type Player } from '@/game/index.ts'
import { createGameSocketServer } from '@/gameServer.ts'
import { Integer } from '@/numbers'

it('waits for the roster, broadcasts register-major actions, and deals two private next rounds', async () => {
  const gameId = '00000000-0000-4000-8000-000000000001'
  const players: Player[] = []
  const board = new Board(Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => new EmptyTile())))
  const deck = Array.from({ length: 5 }, (_, index) =>
    new Card(`00000000-0000-4000-8000-00000000010${index}`, 'TURN_LEFT'))
  const game = new Game(board, players, deck)
  const httpServer = createServer()
  const server = createGameSocketServer(httpServer, { gameId, game })
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  const events: { name: string; payload: unknown }[][] = [[], []]
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
    for (let index = 0; index < 2; index++) {
      const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connectSocket(url, {
        transports: ['websocket'], autoConnect: false, reconnection: false,
      })
      clients.push(socket)
      socket.onAny((name, payload: unknown) => events[index].push({ name, payload }))
      const connected = new Promise<void>((resolve) => socket.once('connect', resolve))
      socket.connect()
      await connected
      await socket.timeout(1000).emitWithAck('user.login', { username: `Player ${index}` })
      const joined = await socket.timeout(1000).emitWithAck('game.join', { gameId })
      expect(joined.outcome).toBe('JOINED')
      const player = game.players[index]
      players.push(player)
      player.setHand(deck.map((card, cardIndex) => new Card(
        `00000000-0000-4000-8000-00000000${index + 2}${cardIndex.toString().padStart(3, '0')}`, 'TURN_LEFT',
      )))
      board.removeRobot(player.robot.id)
      board.placeRobot(player.robot.id, index === 0
        ? { x: Integer(0), y: Integer(2) }
        : { x: Integer(1), y: Integer(1) })
    }

    for (const socket of clients) {
      await socket.timeout(1000).emitWithAck('game.getPublicGameState', { gameId })
    }
    events[0] = []
    events[1] = []

    for (const round of [1, 2]) {
      const submissions = players.map((player): SubmitProgram => ({
        gameId, playerId: player.id,
        cardIds: [player.hand[0].id, player.hand[1].id, player.hand[2].id, player.hand[3].id, player.hand[4].id],
      }))
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ACCEPTED' })
      // State acknowledgements fence each connection's earlier deliveries.
      for (const socket of clients) {
        const waiting = await socket.timeout(1000).emitWithAck('game.getPublicGameState', { gameId })
        expect(waiting).toMatchObject({ outcome: 'GAME_FOUND', state: { phase: 'PROGRAMMING' } })
      }
      expect(events[0]).toEqual([])
      expect(events[1]).toEqual([{
        name: 'program.submitted', payload: { gameId, playerId: players[0].id },
      }])
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ALREADY_SUBMITTED' })
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[1]))
        .toEqual({ outcome: 'PLAYER_ID_MISMATCH' })

      const nextHands = clients.map((socket) => new Promise<CardsDealt>((resolve) =>
        socket.once('cards.dealt', resolve)))
      expect(await clients[1].timeout(1000).emitWithAck('program.submit', submissions[1]))
        .toEqual({ outcome: 'ACCEPTED' })
      const hands = await Promise.all(nextHands)
      for (let index = 0; index < clients.length; index++) {
        expect(hands[index]).toMatchObject({ gameId, playerId: players[index].id })
        expect(events[index].map((event) => event.name)).toEqual([
          'program.submitted',
          ...Array.from({ length: 10 }, () => 'robot.actionResolved'),
          'cards.dealt',
        ])
        expect(events[index][0].payload).toEqual({ gameId, playerId: players[1 - index].id })
        const actions = events[index].filter((event) => event.name === 'robot.actionResolved')
        expect(actions.map((event) => event.payload)).toEqual(
          Array.from({ length: 5 }, (_, registerIndex) => [1, 0].map((playerIndex) => ({
            gameId, registerIndex,
            robotId: players[playerIndex].robot.id,
            instruction: 'TURN_LEFT',
            position: {
              coordinate: playerIndex === 0 ? { x: 0, y: 2 } : { x: 1, y: 1 },
              orientation: ['WEST', 'SOUTH', 'EAST', 'NORTH'][(registerIndex + round - 1) % 4],
            },
          }))).flat(),
        )
        // Each connection receives exactly one hand, for its own assignment.
        expect(events[index].filter((event) => event.name === 'cards.dealt').map((event) => event.payload))
          .toEqual([hands[index]])
        events[index] = []
      }
      expect(game.phase).toBe('programming')
      expect(players.map((player) => player.robot.program)).toEqual([[], []])
    }
  } finally {
    for (const socket of clients) socket.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
