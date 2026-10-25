import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  ClientToServerEvents, GameStarted, GameUpdated, JoinAccepted,
  RobotActionResolved, ServerToClientEvents,
} from '@robo-rally/game-events'
import { io as createClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '@/game/GameFactory'
import { createGameSocketServer, type GameSession, type GameSocketServer } from '@/socket/gameServer'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const empty = Array.from({ length: 5 }, () => ({ status: 'EMPTY' }))
const full = [true, true, true, true, true] as const
const partial = [true, false, true, false, false] as const

// Real Socket.IO connections exercise room routing, serialization and acknowledgement ordering.
describe('public registers over Socket.IO', () => {
  let server: GameSocketServer
  let url: string
  let clients: Client[]
  let sessions: GameSession[]

  beforeEach(async () => {
    clients = []
    sessions = []
    const http = createServer()
    server = createGameSocketServer(http, () => {
      const session = createGame('empty-map')
      sessions.push(session)
      return session
    })
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.restoreAllMocks()
  })

  async function connect(username: string): Promise<Client> {
    const client: Client = createClient(url, {
      transports: ['websocket'], autoConnect: false, reconnection: false,
    })
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
      client.connect()
    })
    expect((await client.timeout(1000).emitWithAck('user.login', { username })).outcome).toBe('LOGGED_IN')
    return client
  }

  async function start(members: Client[]): Promise<JoinAccepted[]> {
    const created = await members[0].timeout(1000).emitWithAck('lobby.create', {})
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    const { lobbyId } = created.lobby
    for (const member of members.slice(1)) {
      expect((await member.timeout(1000).emitWithAck('lobby.join', { lobbyId })).outcome).toBe('LOBBY_JOINED')
    }
    const started = members.map((member) => new Promise<GameStarted>((resolve) => member.once('game.started', resolve)))
    expect((await members[0].timeout(1000).emitWithAck('lobby.start', { lobbyId })).outcome).toBe('STARTED')
    return (await Promise.all(started)).map((payload) => payload.initialization)
  }

  async function snapshot(client: Client): Promise<JoinAccepted> {
    const result = await client.timeout(1000).emitWithAck('session.get', {})
    if (result.outcome !== 'IN_GAME') throw new Error(result.outcome)
    return result.initialization
  }

  async function raw(client: Client, payload: unknown): Promise<unknown> {
    const emit = client.timeout(1000).emitWithAck.bind(client.timeout(1000)) as unknown as
      (event: string, payload: unknown) => Promise<unknown>
    return emit('game.updateRegisters', payload)
  }

  function update(joined: JoinAccepted, occupied: readonly boolean[] = partial) {
    return { gameId: joined.assignment.gameId, playerId: joined.assignment.playerId, occupied }
  }

  function program(joined: JoinAccepted) {
    return {
      gameId: joined.assignment.gameId, playerId: joined.assignment.playerId,
      cardIds: joined.hand.slice(0, 5).map((card) => card.id) as [string, string, string, string, string],
    }
  }

  async function disconnect(client: Client) {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    client.disconnect()
    await closed
  }

  it('initializes empty slots, broadcasts status-only occupancy to every member, and isolates another lobby', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const outsider = await connect('Outside')
    const [a, b] = await start([first, second])
    const [other] = await start([outsider])
    expect(other.assignment.gameId).not.toBe(a.assignment.gameId)
    expect(a.state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(a.hand.every((card) => !b.hand.some((otherCard) => otherCard.id === card.id))).toBe(true)
    const seen = clients.map(() => [] as GameUpdated[])
    clients.forEach((client, index) => client.on('game.updated', (event) => seen[index].push(event)))
    expect(await raw(first, update(a))).toEqual({ outcome: 'ACCEPTED' })
    const state = await snapshot(second)
    await snapshot(first)
    await snapshot(outsider)
    const registers = [
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' },
      { status: 'EMPTY' }, { status: 'EMPTY' },
    ]
    expect(seen.map((events) => events.length)).toEqual([1, 1, 0])
    for (const events of seen.slice(0, 2)) {
      expect(events[0].gameId).toBe(a.assignment.gameId)
      expect(events[0].state).not.toHaveProperty('board')
      expect(events[0].state.players.map((player) => player.registers)).toEqual([registers, empty])
    }
    expect(state.state.players.find((player) => player.playerId === a.assignment.playerId)?.registers).toEqual(registers)
    expect(state.hand).toEqual(b.hand)
    for (const player of state.state.players) {
      expect(player).not.toHaveProperty('hand')
      expect(player).not.toHaveProperty('cardIds')
    }
    for (const card of [...a.hand, ...b.hand]) expect(JSON.stringify(seen)).not.toContain(card.id)
    expect(await raw(first, update(a, [false, false, false, false, false]))).toEqual({ outcome: 'ACCEPTED' })
    expect((await snapshot(first)).state.players[0].registers).toEqual(empty)
  })

  it('rejects invalid occupancy, extra identities, foreign memberships and player spoofing without mutation', async () => {
    const first = await connect('Owner')
    const second = await connect('Peer')
    const outsider = await connect('Other lobby')
    const duplicate = await connect('Owner')
    const [a, b] = await start([first, second])
    await start([outsider])
    const events: GameUpdated[] = []
    first.on('game.updated', (event) => events.push(event))
    for (const payload of [null, {}, update(a, []), update(a, full.slice(0, 4)),
      update(a, [...full, true]), { ...update(a), occupied: [1, false, false, false, false] },
      { ...update(a), occupied: [null, false, false, false, false] },
      { ...update(a), cardIds: a.hand.slice(0, 5).map((card) => card.id) },
      { ...update(a), gameId: 'not-a-uuid' }, { ...update(a), playerId: 'not-a-uuid' }]) {
      expect(await raw(first, payload)).toEqual({ outcome: 'INVALID_REQUEST' })
    }
    expect(await raw(first, { ...update(a), playerId: b.assignment.playerId })).toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
    expect(await raw(first, { ...update(a), gameId: randomUUID() })).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await raw(outsider, update(a))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await raw(duplicate, update(a))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await duplicate.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'USER_ALREADY_IN_SESSION' })
    expect((await snapshot(first)).state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(events).toEqual([])
    expect(await first.timeout(1000).emitWithAck('program.submit', {
      ...program(a), cardIds: program(b).cardIds,
    })).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.timeout(1000).emitWithAck('program.submit', program(b))).toEqual({ outcome: 'PLAYER_ID_MISMATCH' })
    expect(await first.timeout(1000).emitWithAck('program.submit', program(a))).toEqual({ outcome: 'ACCEPTED' })
    expect(await raw(first, update(a))).toEqual({ outcome: 'ALREADY_SUBMITTED' })
    expect((await snapshot(first)).programSubmitted).toBe(true)
    expect(events).toEqual([])
  })

  it('preserves occupancy and private ownership across a fresh reconnect, then removes departed registers and room access', async () => {
    const first = await connect('Returning')
    const second = await connect('Remaining')
    const [a] = await start([first, second])
    expect(await raw(first, update(a))).toEqual({ outcome: 'ACCEPTED' })
    await disconnect(first)
    const disconnected = await snapshot(second)
    expect(disconnected.state.paused).toBe(true)
    expect(disconnected.state.players[0]).toMatchObject({ connected: false, registers: [
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'EMPTY' },
    ] })
    const returning = await connect('Returning')
    const restored = await snapshot(returning)
    expect(restored.assignment).toEqual(a.assignment)
    expect(restored.hand).toEqual(a.hand)
    expect(restored.state.players[0].registers).toEqual(disconnected.state.players[0].registers)
    expect(restored.state.paused).toBe(false)
    const departedEvents: unknown[] = []
    returning.onAny((name, payload: unknown) => departedEvents.push({ name, payload }))
    expect(await returning.timeout(1000).emitWithAck('game.leave', { gameId: a.assignment.gameId })).toEqual({ outcome: 'LEFT' })
    const remaining = await snapshot(second)
    expect(remaining.state.players.map((player) => player.playerId)).not.toContain(a.assignment.playerId)
    expect(await raw(returning, update(a))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await raw(second, update(remaining))).toEqual({ outcome: 'ACCEPTED' })
    await snapshot(second)
    expect(await returning.timeout(1000).emitWithAck('session.get', {})).toEqual({ outcome: 'NO_SESSION' })
    expect(departedEvents).toEqual([])
  })

  it('reveals each executing register without instance IDs, deals privately, and resets before the next snapshot', async () => {
    const first = await connect('A')
    const second = await connect('B')
    const [a, b] = await start([first, second])
    for (const [index, client] of [first, second].entries()) {
      expect(await raw(client, update([a, b][index], full))).toEqual({ outcome: 'ACCEPTED' })
    }
    await snapshot(first)
    await snapshot(second)
    const actions: RobotActionResolved[] = []
    const updates: GameUpdated[] = []
    const privateHands: { playerId: string }[][] = [[], []]
    first.on('robot.actionResolved', (event) => actions.push(event))
    first.on('game.updated', (event) => updates.push(event))
    ;[first, second].forEach((client, index) => client.on('cards.dealt', (event) => privateHands[index].push(event)))
    const reset = new Promise<void>((resolve) => first.once('game.programmingStarted', () => resolve()))
    // Programming start also clears the shared state, so wait for the all-EMPTY update.
    const emptyState = new Promise<GameUpdated>((resolve) => first.on('game.updated', (event) => {
      if (event.state.players.every((player) => player.registers.every((slot) => slot.status === 'EMPTY'))) resolve(event)
    }))
    expect(await first.timeout(1000).emitWithAck('program.submit', program(a))).toEqual({ outcome: 'ACCEPTED' })
    expect(await second.timeout(1000).emitWithAck('program.submit', program(b))).toEqual({ outcome: 'ACCEPTED' })
    await reset
    expect(actions.map((action) => action.registerIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
    const resetState = await emptyState
    const hidden = Array.from({ length: 5 }, () => ({ status: 'HIDDEN' }))
    // One update announces activation, then one follows each resolved action.
    const executionStates = updates.filter((update) => update.state.phase === 'EXECUTING')
    expect(executionStates).toHaveLength(11)
    expect(executionStates[0].state.players.map((player) => player.registers)).toEqual([hidden, hidden])
    const revealedSlots = new Map([[a.assignment.playerId, 0], [b.assignment.playerId, 0]])
    actions.forEach((action, index) => {
      revealedSlots.set(action.playerId, action.registerIndex + 1)
      const expected = [a, b].map((joined) => Array.from({ length: 5 }, (_, slot) =>
        slot < (revealedSlots.get(joined.assignment.playerId) ?? 0)
          ? { status: 'REVEALED', instruction: joined.hand[slot].instruction }
          : { status: 'HIDDEN' }))
      expect(executionStates[index + 1].gameId).toBe(a.assignment.gameId)
      expect(executionStates[index + 1].state.players.map((player) => player.registers)).toEqual(expected)
    })
    expect(updates.every((update) => (update.state as Record<string, unknown>).board === undefined)).toBe(true)
    for (const card of [...a.hand, ...b.hand]) expect(JSON.stringify(updates)).not.toContain(card.id)
    const next = await snapshot(first)
    await snapshot(second)
    expect(next.state.phase).toBe('PROGRAMMING')
    expect(next.state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(next.state.players.map((player) => player.programSubmitted)).toEqual([false, false])
    expect(resetState.state.phase).toBe('PROGRAMMING')
    expect(resetState.state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(updates[updates.length - 1]).toEqual(resetState)
    expect(privateHands.map((hands) => hands.map((hand) => hand.playerId))).toEqual([[a.assignment.playerId], [b.assignment.playerId]])
    expect(await raw(first, update(a))).toEqual({ outcome: 'ACCEPTED' })
  })

  it('rejects occupancy during paused programming and execution while retaining revealed snapshots on reconnect', async () => {
    const first = await connect('A')
    const second = await connect('B')
    const [a, b] = await start([first, second])
    await raw(first, update(a, full))
    await raw(second, update(b, full))
    await disconnect(second)
    expect(await raw(first, update(a))).toEqual({ outcome: 'WRONG_PHASE' })
    const returning = await connect('B')
    await snapshot(returning)
    const game = sessions[0].game
    const execute = game.executeNextAction.bind(game)
    vi.spyOn(game, 'executeNextAction').mockImplementation(() => {
      const result = execute()
      game.pause()
      return result
    })
    const reveal = new Promise<GameUpdated>((resolve) => first.on('game.updated', (event) => {
      if (event.state.players.some((player) => player.registers[0].status === 'REVEALED')) resolve(event)
    }))
    await first.timeout(1000).emitWithAck('program.submit', program(a))
    await returning.timeout(1000).emitWithAck('program.submit', program(b))
    const executed = await reveal
    const executedPlayer = executed.state.players.find((player) => player.registers[0].status === 'REVEALED')!
    expect(await raw(first, update(a))).toEqual({ outcome: 'WRONG_PHASE' })
    await disconnect(returning)
    const reconnected = await connect('B')
    const restored = await snapshot(reconnected)
    expect(restored.state.phase).toBe('EXECUTING')
    expect(restored.state.players.find((player) => player.playerId === executedPlayer.playerId)?.registers)
      .toEqual(executedPlayer.registers)
  })

  it('announces the next programming reset when a departure completes the final register', async () => {
    const first = await connect('A')
    const second = await connect('B')
    const joined = await start([first, second])
    await raw(first, update(joined[0], full))
    await raw(second, update(joined[1], full))
    const game = sessions[0].game
    const execute = game.executeNextAction.bind(game)
    let count = 0
    let lastActor = ''
    vi.spyOn(game, 'executeNextAction').mockImplementation(() => {
      const result = execute()
      count++
      lastActor = result.action.playerId
      if (count === 9) game.pause()
      return result
    })
    const ninth = new Promise<void>((resolve) => first.on('robot.actionResolved', () => {
      if (count === 9) resolve()
    }))
    await first.timeout(1000).emitWithAck('program.submit', program(joined[0]))
    await second.timeout(1000).emitWithAck('program.submit', program(joined[1]))
    await ninth
    const remainingIndex = joined.findIndex((player) => player.assignment.playerId === lastActor)
    const remaining = [first, second][remainingIndex]
    const departing = [first, second][1 - remainingIndex]
    const events: string[] = []
    remaining.onAny((name) => events.push(name))
    const reset = new Promise<void>((resolve) => remaining.once('game.programmingStarted', () => resolve()))
    expect(await departing.timeout(1000).emitWithAck('game.leave', { gameId: joined[0].assignment.gameId })).toEqual({ outcome: 'LEFT' })
    await reset
    const restored = await snapshot(remaining)
    expect(restored.state.players.map((player) => player.registers)).toEqual([empty])
    expect(events.indexOf('game.playerLeft')).toBeLessThan(events.indexOf('game.programmingStarted'))
    expect(count).toBe(9)
  })

  it('admits only one simultaneous recovery of the same Socket.IO session without evicting its owner', async () => {
    const original = await connect('Recovering')
    const peer = await connect('Peer')
    const [initial] = await start([original, peer])
    await snapshot(original)
    const recovery = original as unknown as { _pid: string; _lastOffset: string }
    const auth = { pid: recovery._pid, offset: recovery._lastOffset }
    const disconnected = Promise.withResolvers<void>()
    server.sockets.sockets.get(original.id!)!.once('disconnect', () => disconnected.resolve())
    original.io.engine.close()
    await disconnected.promise
    const attempts = [0, 1].map(() => {
      const client: Client = createClient(url, {
        auth, transports: ['websocket'], autoConnect: false, reconnection: false, forceNew: true,
      })
      clients.push(client)
      const result = Promise.withResolvers<string>()
      client.once('connect', () => result.resolve('CONNECTED'))
      client.once('connect_error', (error) => result.resolve(error.message))
      client.connect()
      return { client, result: result.promise }
    })
    const outcomes = await Promise.all(attempts.map((attempt) => attempt.result))
    expect([...outcomes].sort((a, b) => a.localeCompare(b))).toEqual(['CONNECTED', 'USER_ALREADY_IN_SESSION'])
    const winner = attempts[outcomes.indexOf('CONNECTED')].client
    expect((await snapshot(winner)).assignment).toEqual(initial.assignment)
    const changed = Promise.withResolvers<GameUpdated>()
    winner.once('game.updated', changed.resolve)
    expect(await raw(winner, update(initial))).toEqual({ outcome: 'ACCEPTED' })
    expect((await changed.promise).state.players.find((player) => player.playerId === initial.assignment.playerId)?.registers)
      .toEqual([{ status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'EMPTY' }])
    expect((await snapshot(peer)).state.players.find((player) => player.playerId === initial.assignment.playerId)?.connected).toBe(true)
  })
})
