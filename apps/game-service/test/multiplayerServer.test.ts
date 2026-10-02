import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CardsDealt, ClientToServerEvents, ServerToClientEvents, SubmitProgram } from '@robo-rally/game-events'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Player, Robot, TurnLeft } from '@/game/index.ts'
import { createGameSocketServer } from '@/gameServer.ts'

it('waits for the roster, broadcasts register-major actions, and deals two private next rounds', async () => {
  const gameId = '00000000-0000-4000-8000-000000000001'
  const players = [2, 3].map((id) => new Player(
    `00000000-0000-4000-8000-00000000000${id}`,
    new Robot(`robot-${id}`, Direction.NORTH),
  ))
  const board = new Board(Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => new EmptyTile())))
  board.placeRobot(players[0].robot.id, { x: 0, y: 2 })
  board.placeRobot(players[1].robot.id, { x: 1, y: 1 })
  const deck = Array.from({ length: 5 }, (_, index) =>
    new TurnLeft(`00000000-0000-4000-8000-00000000010${index}`))
  const game = new Game(board, players, deck)
  const httpServer = createServer()
  let connectionIndex = 0
  const server = createGameSocketServer(httpServer, {
    gameId, game, playerForConnection: () => players[connectionIndex++],
  })
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  const events: { name: string; payload: unknown }[][] = [[], []]
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
    for (let index = 0; index < players.length; index++) {
      const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connectSocket(url, {
        transports: ['websocket'], autoConnect: false, reconnection: false,
      })
      clients.push(socket)
      socket.onAny((name, payload: unknown) => events[index].push({ name, payload }))
      const initialHand = new Promise<CardsDealt>((resolve) => socket.once('cards.dealt', resolve))
      socket.connect()
      expect(await initialHand).toMatchObject({ gameId, playerId: players[index].id })
      events[index] = []
    }

    for (const round of [1, 2]) {
      const submissions = players.map((player): SubmitProgram => ({
        gameId, playerId: player.id,
        cardIds: [deck[0].id, deck[1].id, deck[2].id, deck[3].id, deck[4].id],
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
        .toEqual({ outcome: 'INVALID_PROGRAM' })
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[1]))
        .toEqual({ outcome: 'INVALID_PROGRAM' })

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
