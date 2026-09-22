import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CardsDealt, ClientToServerEvents, ServerToClientEvents, SubmitProgram } from '@robo-rally/game-events'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Player, Robot, TurnLeft } from './game/index.js'
import { createGameSocketServer } from './gameServer.js'

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
      expect(await initialHand).toMatchObject({ gameId, roundNumber: 1, playerId: players[index].id })
      events[index] = []
    }

    for (const roundNumber of [1, 2]) {
      const submissions = players.map((player): SubmitProgram => ({
        gameId, roundNumber, playerId: player.id,
        cardIds: [deck[0].id, deck[1].id, deck[2].id, deck[3].id, deck[4].id],
      }))
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'ACCEPTED' })
      // Reading after submission fences delivery without relying on a sleep.
      const waiting = await clients[0].timeout(1000).emitWithAck('game.getPublicGameState', { gameId })
      expect(waiting).toMatchObject({ outcome: 'GAME_FOUND', state: { phase: 'PROGRAMMING', roundNumber } })
      expect(events[0]).toEqual([{
        name: 'program.submitted', payload: { gameId, roundNumber, playerId: players[0].id },
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
        expect(hands[index]).toMatchObject({ gameId, roundNumber: roundNumber + 1, playerId: players[index].id })
        expect(events[index].map((event) => event.name)).toEqual([
          'program.submitted', 'program.submitted', 'game.phaseChanged',
          ...Array.from({ length: 10 }, () => 'robot.actionResolved'),
          'game.phaseChanged', 'cards.dealt',
        ])
        expect(events[index][2].payload).toEqual({ gameId, roundNumber, phase: 'EXECUTING' })
        expect(events[index][13].payload).toEqual({ gameId, roundNumber: roundNumber + 1, phase: 'PROGRAMMING' })
        const actions = events[index].filter((event) => event.name === 'robot.actionResolved')
        expect(actions.map((event) => event.payload)).toEqual(
          Array.from({ length: 5 }, (_, registerIndex) => [1, 0].map((playerIndex) => ({
            gameId, roundNumber, registerIndex,
            robotId: players[playerIndex].robot.id,
            instruction: 'TURN_LEFT',
            position: {
              coordinate: playerIndex === 0 ? { x: 0, y: 2 } : { x: 1, y: 1 },
              orientation: ['WEST', 'SOUTH', 'EAST', 'NORTH'][(registerIndex + roundNumber - 1) % 4],
            },
          }))).flat(),
        )
        // Each connection receives exactly one hand, for its own assignment.
        expect(events[index].filter((event) => event.name === 'cards.dealt').map((event) => event.payload))
          .toEqual([hands[index]])
        events[index] = []
      }
      expect(await clients[0].timeout(1000).emitWithAck('program.submit', submissions[0]))
        .toEqual({ outcome: 'INVALID_PROGRAM' })
      expect(game.phase).toBe('programming')
      expect(game.roundNumber).toBe(roundNumber + 1)
      expect(players.map((player) => player.robot.program)).toEqual([[], []])
    }
  } finally {
    for (const socket of clients) socket.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
