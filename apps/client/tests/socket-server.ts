import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type {
  Card,
  ClientToServerEvents,
  LobbyState,
  ProgramResultAcknowledgement,
  ProgramResultOutcome,
  PublicGameState,
  RegistersChanged,
  ServerToClientEvents,
  SubmitProgram,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import {
  createPublicState,
  GAME_ID,
  HAND_INSTRUCTIONS,
  PLAYER_ID,
  ROBOT_ID,
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
  entryRequests: FixtureSnapshot['entryRequests'][number][]
  deferStart: boolean
  startOutcome: 'STARTED' | 'LOBBY_MEMBER_DISCONNECTED'
  programSubmitted: boolean
  started: boolean
  pendingStarts: { socket: GameSocket; respond: () => void }[]
  pending: { socket: GameSocket; acknowledge: ProgramResultAcknowledgement }[]
}

const fixtures = new Map<string, Fixture>()

function dealCards(): readonly Card[] {
  return Array.from({ length: 9 }, (_, index) => ({
    id: randomUUID(),
    instruction: HAND_INSTRUCTIONS[index],
  }))
}

function snapshot(fixture: Fixture): FixtureSnapshot {
  return {
    id: fixture.id,
    cards: fixture.cards,
    state: fixture.state,
    submissions: fixture.submissions,
    entryRequests: fixture.entryRequests,
    pendingStarts: fixture.pendingStarts.length,
  }
}

function acknowledgeProgram(
  fixture: Fixture,
  sender: GameSocket,
  acknowledge: ProgramResultAcknowledgement,
  outcome: ProgramResultOutcome,
) {
  acknowledge({ outcome })
  if (outcome === 'ACCEPTED') {
    for (const observer of fixture.sockets) {
      if (observer === sender) continue
      observer.emit('program.submitted', {
        gameId: GAME_ID, playerId: PLAYER_ID,
      })
    }
  }
}

function controlFixture(fixture: Fixture, control: FixtureControl) {
  switch (control.type) {
    case 'checkpoint-progress':
      for (const socket of fixture.sockets) socket.emit('player.checkpointProgress', control.progress)
      break
    case 'connection-changed':
      for (const socket of fixture.sockets) socket.emit('game.playerConnectionChanged', control.payload)
      break
    case 'registers-changed':
      for (const socket of fixture.sockets) socket.emit('game.registersChanged', control.payload)
      break
    case 'hand':
      for (const socket of fixture.sockets) socket.emit('cards.dealt', control.hand)
      break
    case 'submitted':
      for (const socket of fixture.sockets) socket.emit('program.submitted', control.submission)
      break
    case 'deal':
      for (const socket of fixture.sockets) socket.emit('cards.dealt', {
        gameId: GAME_ID, playerId: PLAYER_ID, cards: fixture.cards,
      })
      break
    case 'early-hand':
      // Exercise out-of-order delivery without changing the authoritative join hand.
      for (const socket of fixture.sockets) socket.emit('cards.dealt', {
        gameId: GAME_ID, playerId: PLAYER_ID, cards: control.cards,
      })
      break
    case 'disconnect':
      for (const socket of fixture.sockets) socket.conn.close()
      break
    case 'start':
      fixture.startOutcome = control.outcome ?? 'STARTED'
      fixture.deferStart = control.deferred
      break
    case 'respond-start':
      for (const pending of fixture.pendingStarts.splice(0)) pending.respond()
      break
    case 'joined-state':
      fixture.state = control.state
      fixture.cards = control.hand
      fixture.programSubmitted = control.programSubmitted
      break
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
        robots = robots.map((robot) => {
          const position = robot.robotId === action.robotId ? action.position
            : action.pushedRobots.find((pushed) => pushed.robotId === robot.robotId)?.position
          return position === undefined ? robot : { ...robot, position }
        })
      }
      fixture.state = { ...fixture.state, phase: 'PROGRAMMING', robots }
      fixture.cards = dealCards()
      for (const socket of fixture.sockets) {
        for (const action of control.actions) socket.emit('robot.actionResolved', action)
        if (!control.deferHand) socket.emit('cards.dealt', {
          gameId: GAME_ID, playerId: PLAYER_ID, cards: fixture.cards,
        })
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
      entryRequests: [],
      deferStart: false,
      startOutcome: 'STARTED',
      programSubmitted: false,
      started: false,
      pendingStarts: [],
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
  cors: { origin: 'http://127.0.0.1:4173', allowedHeaders: ['x-fixture-id', 'x-fixture-user'] },
})

io.on('connection', (socket) => {
  const fixtureId = socket.handshake.headers['x-fixture-id']
  const fixture = typeof fixtureId === 'string' ? fixtures.get(fixtureId) : undefined
  if (!fixture) {
    socket.disconnect(true)
    return
  }
  fixture.sockets.add(socket)
  const usernameHeader = socket.handshake.headers['x-fixture-user']
  const username = typeof usernameHeader === 'string' ? usernameHeader : 'Player 1'
  const user: User = { userId: username, username }

  let lobby: LobbyState | undefined
  const initialization = () => ({
    outcome: 'JOINED' as const,
    assignment: { gameId: GAME_ID, playerId: PLAYER_ID, robotId: ROBOT_ID },
    state: fixture.state, hand: fixture.cards, programSubmitted: fixture.programSubmitted,
  })
  const mapIcons: Record<string, string> = {
    'empty-map': `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 3"><rect width="3" height="3" fill="#6b7280"/><path d="M1 0V3M2 0V3M0 1H3M0 2H3" stroke="#d1d5db" stroke-width="0.05"/></svg>').toString('base64')}`,
    'test-map': `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#6b7280"/><path d="M1 0V3M2 0V3M3 0V3M0 1H4M0 2H4" stroke="#d1d5db" stroke-width="0.05"/></svg>').toString('base64')}`,
  } as const
  const maps = [
    { mapName: 'empty-map', name: 'Empty Map', icon: mapIcons['empty-map'], defaultForLobbyCreation: false },
    { mapName: 'test-map', name: 'Test Map', icon: mapIcons['test-map'], defaultForLobbyCreation: true },
  ]
  const lobbyState = (mapName = 'test-map', lobbyName = 'Lobby 1'): LobbyState => {
    const map = maps.find((candidate) => candidate.mapName === mapName) ?? maps[1]!
    return {
    lobbyId: GAME_ID, name: lobbyName, mapName: map.mapName, mapDisplayName: map.name, mapIcon: map.icon, ownerUserId: user.userId,
    playerCount: 1, maxPlayers: 6, players: [user],
    }
  }
  socket.on('session.get', (_, acknowledge) => {
    fixture.entryRequests.push({ event: 'session.get', socketId: socket.id, payload: {} })
    acknowledge(fixture.started ? { outcome: 'IN_GAME', initialization: initialization(), user }
      : lobby ? { outcome: 'IN_LOBBY', lobby, user } : { outcome: 'NO_SESSION', user })
  })
  socket.on('lobby.list', (_, acknowledge) => acknowledge({ outcome: 'LOBBIES_FOUND', lobbies: [lobbyState()], maps }))
  socket.on('lobby.create', (payload, acknowledge) => {
    fixture.entryRequests.push({ event: 'lobby.create', socketId: socket.id, payload })
    lobby = lobbyState(payload.mapName, payload.name)
    acknowledge({ outcome: 'LOBBY_JOINED', lobby })
  })
  socket.on('lobby.join', (payload, acknowledge) => {
    fixture.entryRequests.push({ event: 'lobby.join', socketId: socket.id, payload })
    lobby = lobbyState()
    acknowledge({ outcome: 'LOBBY_JOINED', lobby })
  })
  socket.on('lobby.leave', (_, acknowledge) => {
    lobby = undefined
    acknowledge({ outcome: 'LEFT' })
  })
  socket.on('lobby.start', (payload, acknowledge) => {
    fixture.entryRequests.push({ event: 'lobby.start', socketId: socket.id, payload })
    if (fixture.startOutcome !== 'STARTED') return acknowledge({ outcome: fixture.startOutcome })
    fixture.started = true
    const respond = () => {
      socket.emit('game.started', { lobbyId: GAME_ID, initialization: initialization() })
      acknowledge({ outcome: 'STARTED', gameId: GAME_ID })
    }
    if (fixture.deferStart) fixture.pendingStarts.push({ socket, respond })
    else respond()
  })
  socket.on('game.leave', (_, acknowledge) => {
    fixture.started = false
    lobby = undefined
    acknowledge({ outcome: 'LEFT' })
  })

  socket.on('game.updateRegisters', (payload, acknowledge) => {
    const registers: RegistersChanged['registers'] = [
      { status: payload.occupied[0] ? 'HIDDEN' : 'EMPTY' },
      { status: payload.occupied[1] ? 'HIDDEN' : 'EMPTY' },
      { status: payload.occupied[2] ? 'HIDDEN' : 'EMPTY' },
      { status: payload.occupied[3] ? 'HIDDEN' : 'EMPTY' },
      { status: payload.occupied[4] ? 'HIDDEN' : 'EMPTY' },
    ]
    fixture.state = {
      ...fixture.state,
      players: fixture.state.players.map((player) => player.playerId === PLAYER_ID ? { ...player, registers } : player),
    }
    acknowledge({ outcome: 'ACCEPTED' })
    for (const observer of fixture.sockets) observer.emit('game.registersChanged', {
      gameId: GAME_ID, playerId: PLAYER_ID, registers,
    })
  })

  socket.on('program.submit', (payload, acknowledge) => {
    fixture.submissions.push(payload)
    const valid = payload.cardIds.length === 5
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
    fixture.pendingStarts = fixture.pendingStarts.filter((pending) => pending.socket !== socket)
  })
})

httpServer.listen(4174, '127.0.0.1')
