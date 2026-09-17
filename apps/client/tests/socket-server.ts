import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type {
  Card,
  ClientToServerEvents,
  ProgramResultAcknowledgement,
  ProgramResultOutcome,
  PublicGameState,
  ServerToClientEvents,
  SubmitProgram,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import {
  createPublicState,
  GAME_ID,
  PLAYER_ID,
  type FixtureControl,
  type FixtureSnapshot,
} from './game-fixture-data.ts'

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>
type Fixture = {
  id: string
  cards: readonly Card[]
  state: PublicGameState
  submissions: SubmitProgram[]
  sockets: Set<GameSocket>
  outcome: ProgramResultOutcome
  deferred: boolean
  pending: { socket: GameSocket; acknowledge: ProgramResultAcknowledgement }[]
}

const fixtures = new Map<string, Fixture>()

function dealCards(): readonly Card[] {
  return Array.from({ length: 9 }, (_, index) => ({
    id: randomUUID(),
    instruction: index % 2 === 0 ? 'MOVE_1' : 'TURN_LEFT',
  }))
}

function snapshot(fixture: Fixture): FixtureSnapshot {
  return {
    id: fixture.id,
    cards: fixture.cards,
    state: fixture.state,
    submissions: fixture.submissions,
  }
}

function acknowledgeProgram(
  fixture: Fixture,
  socket: GameSocket,
  acknowledge: ProgramResultAcknowledgement,
  outcome: ProgramResultOutcome,
) {
  acknowledge({ outcome })
  if (outcome === 'ACCEPTED') {
    fixture.state = { ...fixture.state, phase: 'EXECUTING' }
    socket.emit('program.submitted', { playerId: PLAYER_ID })
  }
}

function controlFixture(fixture: Fixture, control: FixtureControl) {
  switch (control.type) {
    case 'submission':
      fixture.outcome = control.outcome
      fixture.deferred = control.deferred
      break
    case 'acknowledge':
      for (const pending of fixture.pending.splice(0)) {
        acknowledgeProgram(fixture, pending.socket, pending.acknowledge, control.outcome)
      }
      break
    case 'round': {
      let robots = fixture.state.robots
      for (const action of control.actions) {
        robots = robots.map((robot) => robot.robotId === action.robotId
          ? { ...robot, position: action.position }
          : robot)
      }
      fixture.state = { ...fixture.state, phase: control.phase ?? 'PROGRAMMING', robots }
      fixture.cards = dealCards()
      for (const socket of fixture.sockets) {
        for (const action of control.actions) socket.emit('robot.actionResolved', action)
        socket.emit('cards.dealt', { cards: fixture.cards })
      }
      break
    }
  }
}

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4174')
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(body))
  }

  if (url.pathname === '/health') {
    send(200, { ready: true })
    return
  }
  if (url.pathname === '/fixtures' && request.method === 'POST') {
    const fixture: Fixture = {
      id: randomUUID(),
      cards: dealCards(),
      state: createPublicState(),
      submissions: [],
      sockets: new Set(),
      outcome: 'ACCEPTED',
      deferred: false,
      pending: [],
    }
    fixtures.set(fixture.id, fixture)
    send(201, snapshot(fixture))
    return
  }

  const fixture = fixtures.get(url.pathname.split('/')[2])
  if (!fixture) {
    send(404, { error: 'Fixture not found' })
    return
  }
  if (request.method === 'DELETE') {
    for (const socket of fixture.sockets) socket.disconnect(true)
    fixtures.delete(fixture.id)
    send(200, { deleted: true })
    return
  }
  if (request.method === 'POST') {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      controlFixture(fixture, JSON.parse(Buffer.concat(chunks).toString()) as FixtureControl)
    } catch (error) {
      send(400, { error: String(error) })
      return
    }
  }
  send(200, snapshot(fixture))
})

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: 'http://127.0.0.1:4173', allowedHeaders: ['x-fixture-id'] },
})

io.on('connection', (socket) => {
  const fixtureId = socket.handshake.headers['x-fixture-id']
  const fixture = typeof fixtureId === 'string' ? fixtures.get(fixtureId) : undefined
  if (!fixture) {
    socket.disconnect(true)
    return
  }
  fixture.sockets.add(socket)
  let dealt = false

  socket.on('game.getPublicGameState', ({ gameId }, acknowledge) => {
    if (gameId !== GAME_ID) {
      acknowledge({ outcome: 'GAME_NOT_FOUND' })
      return
    }
    acknowledge({ outcome: 'GAME_FOUND', state: fixture.state })
    if (!dealt) {
      dealt = true
      socket.emit('cards.dealt', { cards: fixture.cards })
    }
  })

  socket.on('program.submit', (payload, acknowledge) => {
    fixture.submissions.push(payload)
    const valid = payload.gameId === GAME_ID
      && payload.cardIds.length === 5
      && new Set(payload.cardIds).size === 5
      && payload.cardIds.every((id) => fixture.cards.some((card) => card.id === id))
    if (!valid) {
      acknowledge({ outcome: 'INVALID_PROGRAM' })
    } else if (fixture.deferred) {
      fixture.pending.push({ socket, acknowledge })
    } else {
      acknowledgeProgram(fixture, socket, acknowledge, fixture.outcome)
    }
  })

  socket.on('disconnect', () => {
    fixture.sockets.delete(socket)
    fixture.pending = fixture.pending.filter((pending) => pending.socket !== socket)
  })
})

httpServer.listen(4174, '127.0.0.1')
