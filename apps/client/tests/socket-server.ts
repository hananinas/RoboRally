import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type {
  Card,
  ClientToServerEvents,
  JoinResult,
  LoginResult,
  LobbyDetails,
  LobbyDetailsResult,
  ProgramResultAcknowledgement,
  ProgramResultOutcome,
  PublicGameState,
  ServerToClientEvents,
  SubmitProgram,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import {
  createLobby,
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
  loginOutcome: LoginResult['outcome']
  joinOutcome: JoinResult['outcome']
  deferLogin: boolean
  deferJoin: boolean
  programSubmitted: boolean
  pendingLogins: { socket: GameSocket; respond: () => void }[]
  pendingJoins: { socket: GameSocket; respond: () => void }[]
  lobbyOutcome: LobbyDetailsResult['outcome']
  lobbies: readonly LobbyDetails[]
  deferLobby: boolean
  lobbyRequests: number
  pendingLobbies: { socket: GameSocket; respond: () => void }[]
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
    pendingLogins: fixture.pendingLogins.length,
    pendingJoins: fixture.pendingJoins.length,
    lobbyRequests: fixture.lobbyRequests,
    pendingLobbies: fixture.pendingLobbies.length,
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
      for (const socket of fixture.sockets) socket.disconnect(true)
      break
    case 'login':
      fixture.loginOutcome = control.outcome
      fixture.deferLogin = control.deferred
      break
    case 'join':
      fixture.joinOutcome = control.outcome
      fixture.deferJoin = control.deferred
      break
    case 'respond-login':
      for (const pending of fixture.pendingLogins.splice(0)) pending.respond()
      break
    case 'respond-join':
      for (const pending of fixture.pendingJoins.splice(0)) pending.respond()
      break
    case 'lobby':
      fixture.lobbyOutcome = control.outcome
      fixture.deferLobby = control.deferred
      if (control.lobbies) fixture.lobbies = control.lobbies
      break
    case 'respond-lobby':
      for (const pending of fixture.pendingLobbies.splice(0)) pending.respond()
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
        robots = robots.map((robot) => robot.robotId === action.robotId
          ? { ...robot, position: action.position }
          : robot)
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
      loginOutcome: 'LOGGED_IN',
      joinOutcome: 'JOINED',
      deferLogin: false,
      deferJoin: false,
      programSubmitted: false,
      pendingLogins: [],
      lobbyOutcome: 'LOBBY_FOUND',
      lobbies: [createLobby()],
      deferLobby: false,
      lobbyRequests: 0,
      pendingLobbies: [],
      pendingJoins: [],
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
  let user: User | undefined

  socket.on('user.login', (payload, acknowledge) => {
    fixture.entryRequests.push({ event: 'user.login', socketId: socket.id, payload })
    let result: LoginResult
    if (fixture.loginOutcome !== 'LOGGED_IN') {
      result = { outcome: fixture.loginOutcome }
    } else if (user && user.username !== payload.username) {
      result = { outcome: 'ALREADY_LOGGED_IN' }
    } else {
      user ??= { userId: randomUUID(), username: payload.username }
      result = { outcome: 'LOGGED_IN', user }
    }
    // Delay only delivery: a timed-out request may already have bound the identity.
    const respond = () => acknowledge(result)
    if (fixture.deferLogin) fixture.pendingLogins.push({ socket, respond })
    else respond()
  })

  socket.on('game.join', (payload, acknowledge) => {
    fixture.entryRequests.push({ event: 'game.join', socketId: socket.id, payload })
    const respond = () => {
      if (!user || fixture.joinOutcome === 'LOGIN_REQUIRED') {
        user = undefined
        acknowledge({ outcome: 'LOGIN_REQUIRED' })
      } else if (payload.gameId !== GAME_ID) {
        acknowledge({ outcome: 'GAME_NOT_FOUND' })
      } else if (fixture.joinOutcome !== 'JOINED') {
        acknowledge({ outcome: fixture.joinOutcome })
      } else {
        acknowledge({
          outcome: 'JOINED',
          assignment: { gameId: GAME_ID, playerId: PLAYER_ID, robotId: ROBOT_ID },
          state: fixture.state,
          hand: fixture.cards,
          programSubmitted: fixture.programSubmitted,
        })
      }
    }
    if (fixture.deferJoin) fixture.pendingJoins.push({ socket, respond })
    else respond()
  })

  socket.on('game.getLobbyDetails', (_payload, acknowledge) => {
    fixture.lobbyRequests += 1
    // Read the outcome when responding so tests can change it while a request is deferred.
    const respond = () => {
      if (!user) acknowledge({ outcome: 'LOGIN_REQUIRED' })
      else if (fixture.lobbyOutcome !== 'LOBBY_FOUND') acknowledge({ outcome: fixture.lobbyOutcome })
      else acknowledge({ outcome: 'LOBBY_FOUND', lobbies: fixture.lobbies })
    }
    if (fixture.deferLobby) fixture.pendingLobbies.push({ socket, respond })
    else respond()
  })

  socket.on('program.submit', (payload, acknowledge) => {
    fixture.submissions.push(payload)
    const valid = payload.gameId === GAME_ID
      && payload.playerId === PLAYER_ID
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
    fixture.pendingLogins = fixture.pendingLogins.filter((pending) => pending.socket !== socket)
    fixture.pendingJoins = fixture.pendingJoins.filter((pending) => pending.socket !== socket)
    fixture.pendingLobbies = fixture.pendingLobbies.filter((pending) => pending.socket !== socket)
  })
})

httpServer.listen(4174, '127.0.0.1')
