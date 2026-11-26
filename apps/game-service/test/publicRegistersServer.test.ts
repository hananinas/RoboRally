import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  CardsDealt, ClientToServerEvents, GameInitialization, RegistersChanged,
  RobotActionResolved, ServerToClientEvents,
} from '@robo-rally/game-events'
import { io as createClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as actionScheduler from '@/socket/gameSession/actionScheduler'
import type { Game } from '@/domain/game/Game'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import { createFakeGameRepository } from './repositoryTestHelper.ts'
import * as gameSessionModule from '@/socket/gameSession/GameSession'
import { createSessionStore, type SessionStore } from '@/auth/sessionStore'
import { authCookieHeader } from './authTestHelper.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
type GameStarted = Parameters<ServerToClientEvents['game.started']>[0]
const empty = Array.from({ length: 5 }, () => ({ status: 'EMPTY' }))
const full = [0, 1, 2, 3, 4] as const
const partial = [0, null, 2, null, null] as const

// Real Socket.IO connections exercise room routing, serialization and acknowledgement ordering.
describe('public registers over Socket.IO', () => {
  let server: GameSocketServer
  let url: string
  let clients: Client[]
  let contexts: MockInstance<typeof gameSessionModule.GameSession>
  let sessionStore: SessionStore

  beforeEach(async () => {
    clients = []
    contexts = vi.spyOn(gameSessionModule, 'GameSession')
    const http = createServer()
    sessionStore = createSessionStore({ oidcClient: { refreshToken: vi.fn() }, refreshBufferSeconds: 0 })
    server = createGameSocketServer(http, sessionStore, createFakeGameRepository())
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.restoreAllMocks()
  })

  function currentGame(index = 0): Game {
    const result = contexts.mock.results[index]
    if (!result) throw new Error('No game has started yet')
    return result.value.game
  }

  async function connect(username: string): Promise<Client> {
    const client: Client = createClient(url, {
      transports: ['websocket'], autoConnect: false, reconnection: false,
      extraHeaders: authCookieHeader(sessionStore, username, username),
    })
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
      client.connect()
    })
    return client
  }

  async function start(members: Client[]): Promise<GameInitialization[]> {
    const created = await members[0].timeout(1000).emitWithAck('lobby.create', { mapName: 'test-map' })
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    const { lobbyId } = created.lobby
    for (const member of members.slice(1)) {
      expect((await member.timeout(1000).emitWithAck('lobby.join', { lobbyId })).outcome).toBe('LOBBY_JOINED')
    }
    const started = members.map((member) => new Promise<GameStarted>((resolve) => member.once('game.started', resolve)))
    expect((await members[0].timeout(1000).emitWithAck('lobby.start', {})).outcome).toBe('STARTED')
    return (await Promise.all(started)).map((payload) => payload.initialization)
  }

  async function snapshot(client: Client): Promise<GameInitialization> {
    const result = await client.timeout(1000).emitWithAck('membership.get', {})
    if (result.outcome !== 'IN_GAME') throw new Error(result.outcome)
    return result.initialization
  }

  async function raw(client: Client, payload: unknown): Promise<unknown> {
    const emit = client.timeout(1000).emitWithAck.bind(client.timeout(1000)) as unknown as
      (event: string, payload: unknown) => Promise<unknown>
    return emit('game.updateRegisters', payload)
  }

  function update(joined: GameInitialization, slots: readonly (number | null)[] = partial) {
    return { cardIds: slots.map((slot) => slot === null ? null : joined.hand[slot].id) }
  }

  function program(joined: GameInitialization) {
    return {
      cardIds: joined.hand.slice(0, 5).map((card) => card.id) as [string, string, string, string, string],
    }
  }

  async function disconnect(client: Client) {
    const closed = new Promise((resolve) => server.sockets.sockets.get(client.id!)!.once('disconnect', resolve))
    client.disconnect()
    await closed
  }

  it('finalizes saved selections at the deadline while paused and restores them on reconnect', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const [a, b] = await start([first, second])
    const ctx = contexts.mock.results[0].value as gameSessionModule.GameSession
    vi.spyOn(ctx.actionScheduler, 'scheduleNextAction').mockImplementation(() => {})
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await raw(second, update(b, [null, 8, null, 0, null]))
    expect(await first.emitWithAck('program.submit', program(a))).toEqual({ outcome: 'ACCEPTED' })
    expect(ctx.programmingTimer.state()).toEqual({ status: 'RUNNING', deadline: now + 30_000 })
    await disconnect(second)
    await snapshot(first)
    const events: string[] = []
    first.onAny((name) => events.push(name))

    now += 30_000
    expect(ctx.programmingTimer.expireIfDue()).toBe(true)
    now -= 30_000
    const closed = await snapshot(first)
    expect(closed.state).toMatchObject({ paused: true, phase: 'PROGRAMMING', programmingTimer: { status: 'CLOSED' } })
    expect(events).toEqual(['game.registersChanged', 'program.submitted', 'program.timerChanged'])

    const restored = await snapshot(await connect('Second'))
    expect(restored.program).toEqual([b.hand[1], b.hand[8], b.hand[2], b.hand[0], b.hand[3]])
    expect(restored.programSubmitted).toBe(true)
    expect(restored.state.paused).toBe(false)
    expect(restored.state.phase).toBe('EXECUTING')
    expect(restored.state.serverTime).toBe(now)
    expect(ctx.game.players.every((player) => player.hand.length === 0)).toBe(true)
    expect(await first.emitWithAck('program.submit', program(a))).toEqual({ outcome: 'WRONG_PHASE' })
  })

  it('initializes empty slots, broadcasts status-only occupancy to every member, and isolates another lobby', async () => {
    const first = await connect('First')
    const second = await connect('Second')
    const outsider = await connect('Outside')
    const [a, b] = await start([first, second])
    const [other] = await start([outsider])
    expect(other.assignment.gameId).not.toBe(a.assignment.gameId)
    expect(a.state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(a.hand.every((card) => !b.hand.some((otherCard) => otherCard.id === card.id))).toBe(true)
    const seen = clients.map(() => [] as RegistersChanged[])
    clients.forEach((client, index) => client.on('game.registersChanged', (event) => seen[index].push(event)))
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
      expect(events[0]).toEqual({
        gameId: a.assignment.gameId, playerId: a.assignment.playerId, registers,
      })
      expect(events[0]).not.toHaveProperty('board')
      expect(events[0]).not.toHaveProperty('state')
      for (const slot of events[0].registers) {
        expect(slot).not.toHaveProperty('instruction')
        expect(slot).not.toHaveProperty('cardId')
        expect(slot).not.toHaveProperty('id')
      }
    }
    expect(state.state.players.find((player) => player.playerId === a.assignment.playerId)?.registers).toEqual(registers)
    expect(state.hand).toEqual(b.hand)
    expect(state.program).toEqual([null, null, null, null, null])
    expect((await snapshot(first)).program).toEqual([a.hand[0], null, a.hand[2], null, null])
    for (const player of state.state.players) {
      expect(player).not.toHaveProperty('hand')
      expect(player).not.toHaveProperty('cardIds')
    }
    const publicPayloads = JSON.stringify([seen, a.state, b.state, state.state])
    for (const card of [...a.hand, ...b.hand]) expect(publicPayloads).not.toContain(card.id)
    expect(await raw(first, update(a, [null, null, null, null, null]))).toEqual({ outcome: 'ACCEPTED' })
    expect((await snapshot(first)).state.players[0].registers).toEqual(empty)
    await snapshot(second)
    await snapshot(outsider)
    expect(seen.map((events) => events.length)).toEqual([2, 2, 0])
    for (const events of seen.slice(0, 2)) {
      expect(events[1]).toEqual({
        gameId: a.assignment.gameId, playerId: a.assignment.playerId, registers: empty,
      })
    }
  })

  it('rejects invalid selections, extra identities, foreign memberships and player spoofing without mutation', async () => {
    const first = await connect('Owner')
    const second = await connect('Peer')
    const outsider = await connect('Other lobby')
    const duplicate = await connect('Owner')
    const [a, b] = await start([first, second])
    const [other] = await start([outsider])
    const events: RegistersChanged[] = []
    first.on('game.registersChanged', (event) => events.push(event))
    for (const payload of [null, {}, update(a, []), update(a, full.slice(0, 4)),
      update(a, [...full, 5]), { cardIds: [1, null, null, null, null] },
      { cardIds: [true, null, null, null, null] },
      { occupied: [true, false, true, false, false] },
      { ...update(a), gameId: a.assignment.gameId }, { ...update(a), playerId: b.assignment.playerId }]) {
      expect(await raw(first, payload)).toEqual({ outcome: 'INVALID_REQUEST' })
    }
    const saved = update(a)
    expect(await raw(first, saved)).toEqual({ outcome: 'ACCEPTED' })
    await snapshot(first)
    events.length = 0
    for (const payload of [update(a, [0, 0, null, null, null]), update(b),
      { cardIds: [randomUUID(), null, null, null, null] }]) {
      expect(await raw(first, payload)).toEqual({ outcome: 'INVALID_PROGRAM' })
      expect((await snapshot(first)).program.map((card) => card?.id ?? null)).toEqual(saved.cardIds)
    }
    expect(await raw(first, update(a, [null, null, null, null, null]))).toEqual({ outcome: 'ACCEPTED' })
    await snapshot(first)
    events.length = 0
    // Session routing selects the caller's own game; the per-session membership guard rejects a foreign socket directly.
    const foreignGame = contexts.mock.results[0].value as gameSessionModule.GameSession
    expect(foreignGame.isMember(server.sockets.sockets.get(outsider.id!)!).isErr()).toBe(true)
    expect(await raw(outsider, update(other))).toEqual({ outcome: 'ACCEPTED' })
    expect((await snapshot(outsider)).state.players[0].registers).toEqual([
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' },
      { status: 'EMPTY' }, { status: 'EMPTY' },
    ])
    expect(await raw(duplicate, update(a))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await duplicate.timeout(1000).emitWithAck('membership.get', {})).toEqual({ outcome: 'ALREADY_HAS_MEMBERSHIP' })
    expect((await snapshot(first)).state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(events).toEqual([])
    expect(await first.timeout(1000).emitWithAck('program.submit', {
      ...program(a), cardIds: program(b).cardIds,
    })).toEqual({ outcome: 'INVALID_PROGRAM' })
    // Identity is session-derived, so another player's cards are invalid for the caller.
    expect(await first.timeout(1000).emitWithAck('program.submit', program(b))).toEqual({ outcome: 'INVALID_PROGRAM' })
    expect(await first.timeout(1000).emitWithAck('program.submit', program(a))).toEqual({ outcome: 'ACCEPTED' })
    expect(await raw(first, update(a))).toEqual({ outcome: 'ALREADY_SUBMITTED' })
    expect((await snapshot(first)).programSubmitted).toBe(true)
    expect(events).toEqual([{
      gameId: a.assignment.gameId, playerId: a.assignment.playerId,
      registers: Array.from({ length: 5 }, () => ({ status: 'HIDDEN' })),
    }])
  })

  it('preserves occupancy and private ownership across a fresh reconnect, then removes departed registers and room access', async () => {
    const first = await connect('Returning')
    const second = await connect('Remaining')
    const [a, b] = await start([first, second])
    expect(await raw(first, update(a))).toEqual({ outcome: 'ACCEPTED' })
    await disconnect(first)
    const disconnected = await snapshot(second)
    expect(disconnected.state.paused).toBe(true)
    expect(disconnected.state.players[0]).toMatchObject({ connected: false, registers: [
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'EMPTY' },
    ] })
    const returning = await connect('Returning')
    const resumed = new Promise<void>((resolve) => returning.once('game.playerConnectionChanged', () => resolve()))
    const timerRestored = new Promise<void>((resolve) => returning.once('program.timerChanged', () => resolve()))
    const restored = await snapshot(returning)
    await resumed
    await timerRestored
    expect(restored.assignment).toEqual(a.assignment)
    expect(restored.hand).toEqual(a.hand)
    expect(restored.program).toEqual([a.hand[0], null, a.hand[2], null, null])
    expect(restored.state.players[0].registers).toEqual(disconnected.state.players[0].registers)
    expect(restored.state.paused).toBe(false)
    const departedEvents: unknown[] = []
    returning.onAny((name, payload: unknown) => departedEvents.push({ name, payload }))
    expect(await returning.timeout(1000).emitWithAck('game.leave', {})).toEqual({ outcome: 'LEFT' })
    const remaining = await snapshot(second)
    expect(remaining.state.players.map((player) => player.playerId)).not.toContain(a.assignment.playerId)
    expect(await raw(returning, update(a))).toEqual({ outcome: 'NOT_A_MEMBER' })
    expect(await raw(second, update(b))).toEqual({ outcome: 'ACCEPTED' })
    await snapshot(second)
    expect(await returning.timeout(1000).emitWithAck('membership.get', {})).toEqual({
      outcome: 'NO_MEMBERSHIP', user: { userId: 'Returning', username: 'Returning' },
    })
    expect(departedEvents).toEqual([])
  })

  it('reveals only executed instructions, then resets slots and deals privately at round completion', async () => {
    const first = await connect('A')
    const second = await connect('B')
    const createScheduler = actionScheduler.createActionScheduler
    let scheduler: actionScheduler.ActionScheduler | undefined
    vi.spyOn(actionScheduler, 'createActionScheduler').mockImplementation((deps) => {
      scheduler = createScheduler(deps)
      return scheduler
    })
    const [a, b] = await start([first, second])
    for (const [index, client] of [first, second].entries()) {
      expect(await raw(client, update([a, b][index], full))).toEqual({ outcome: 'ACCEPTED' })
    }
    await snapshot(first)
    await snapshot(second)
    const game = currentGame()
    const execute = game.executeNextAction.bind(game)
    vi.spyOn(game, 'executeNextAction').mockImplementation(() => {
      const result = execute()
      if (game.lastActivePhase === 'activation') game.pause()
      return result
    })
    const submit = game.submitProgram.bind(game)
    vi.spyOn(game, 'submitProgram').mockImplementation((...args) => {
      const result = submit(...args)
      if (game.lastActivePhase === 'activation') game.pause()
      return result
    })
    const actions: RobotActionResolved[] = []
    const registerEvents: RegistersChanged[] = []
    const executionStates: GameInitialization['state'][] = []
    const privateHands: CardsDealt[][] = [[], []]
    const observed: { name: string; payload: unknown }[][] = [[], []]
    ;[first, second].forEach((client, index) => client.onAny((name, payload: unknown) => {
      if (name !== 'program.timerChanged') observed[index].push({ name, payload })
    }))
    first.on('robot.actionResolved', (event) => actions.push(event))
    first.on('game.registersChanged', (event) => registerEvents.push(event))
    ;[first, second].forEach((client, index) => client.on('cards.dealt', (event) => privateHands[index].push(event)))
    const firstAction = new Promise<RobotActionResolved>((resolve) => first.once('robot.actionResolved', resolve))
    expect(await first.timeout(1000).emitWithAck('program.submit', program(a))).toEqual({ outcome: 'ACCEPTED' })
    expect(await second.timeout(1000).emitWithAck('program.submit', program(b))).toEqual({ outcome: 'ACCEPTED' })
    const activation = await snapshot(first)
    const hidden = Array.from({ length: 5 }, () => ({ status: 'HIDDEN' }))
    expect(activation.state.phase).toBe('EXECUTING')
    expect(activation.program).toEqual(a.hand.slice(0, 5))
    expect((await snapshot(second)).program).toEqual(b.hand.slice(0, 5))
    expect(activation.state.players.map((player) => player.registers)).toEqual([hidden, hidden])
    expect((await snapshot(second)).state).toEqual({ ...activation.state, serverTime: expect.any(Number) })
    expect(actions).toEqual([])
    const finalizationEvents = observed.map((_, index) => [0, 1].flatMap((playerIndex) => [
      ...(playerIndex === index ? ['program.finalized'] : []), 'game.registersChanged', 'program.submitted',
    ]))
    for (const [index, events] of observed.entries()) {
      expect(events.map((event) => event.name)).toEqual(finalizationEvents[index])
      const own = [a, b][index]
      expect(events.filter((event) => event.name === 'program.finalized').map((event) => event.payload)).toEqual([{
        gameId: own.assignment.gameId, playerId: own.assignment.playerId, reason: 'SUBMITTED', cards: own.hand.slice(0, 5),
      }])
      expect(JSON.stringify(events.filter((event) => event.name !== 'program.finalized'))).not.toContain('instruction')
    }
    expect(JSON.stringify(activation.state)).not.toContain('instruction')
    game.resume()
    scheduler!.scheduleNextAction()
    let action = await firstAction
    const revealedSlots = new Map([[a.assignment.playerId, 0], [b.assignment.playerId, 0]])
    for (let index = 0; index < 10; index++) {
      expect(action.gameId).toBe(a.assignment.gameId)
      expect(action.registerIndex).toBe(Math.floor(index / 2))
      const actor = [a, b].find((joined) => joined.assignment.playerId === action.playerId)
      expect(actor).toBeDefined()
      expect(action.robotId).toBe(actor!.assignment.robotId)
      expect(action.instruction).toBe(actor!.hand[action.registerIndex].instruction)
      expect(revealedSlots.get(action.playerId)).toBe(action.registerIndex)
      revealedSlots.set(action.playerId, action.registerIndex + 1)
      const expected = [a, b].map((joined) => Array.from({ length: 5 }, (_, slot) =>
        slot < (revealedSlots.get(joined.assignment.playerId) ?? 0)
          ? { status: 'REVEALED', instruction: joined.hand[slot].instruction }
          : { status: 'HIDDEN' }))
      if (index === 9) {
        const nextHand = new Promise<void>((resolve) => first.once('cards.dealt', () => resolve()))
        game.resume()
        scheduler!.scheduleNextAction()
        await nextHand
      }
      const current = await snapshot(first)
      executionStates.push(current.state)
      expect(current.state.phase).toBe(index < 9 ? 'EXECUTING' : 'PROGRAMMING')
      expect(current.state).toHaveProperty('board')
      expect(current.state.players.map((player) => player.registers)).toEqual(index < 9 ? expected : [empty, empty])
      if (index < 9) expect(current.hand).toEqual([])
      else expect(current.hand).not.toEqual(a.hand)
      expect((await snapshot(second)).state).toEqual({ ...current.state, serverTime: expect.any(Number) })
      expect(actions).toHaveLength(index + 1)
      if (index < 9) {
        const nextAction = new Promise<RobotActionResolved>((resolve) => first.once('robot.actionResolved', resolve))
        game.resume()
        scheduler!.scheduleNextAction()
        action = await nextAction
      }
    }
    expect(actions.map((resolved) => resolved.registerIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
    const next = await snapshot(first)
    const otherNext = await snapshot(second)
    expect(next.state.phase).toBe('PROGRAMMING')
    expect(next.program).toEqual([null, null, null, null, null])
    expect(otherNext.program).toEqual([null, null, null, null, null])
    expect(next.state.players.map((player) => player.registers)).toEqual([empty, empty])
    expect(next.state.players.map((player) => player.programSubmitted)).toEqual([false, false])
    expect(otherNext.state).toEqual({ ...next.state, serverTime: expect.any(Number) })
    expect(privateHands).toEqual([
      [{ gameId: a.assignment.gameId, playerId: a.assignment.playerId, cards: next.hand }],
      [{ gameId: b.assignment.gameId, playerId: b.assignment.playerId, cards: otherNext.hand }],
    ])
    expect(next.hand.every((card) => !otherNext.hand.some((otherCard) => otherCard.id === card.id))).toBe(true)
    expect(registerEvents).toEqual([a, b].map((own) => ({
      gameId: own.assignment.gameId, playerId: own.assignment.playerId, registers: hidden,
    })))
    for (const [index, events] of observed.entries()) {
      expect(events.filter((event) => event.name !== 'environment.stepResolved').map((event) => event.name)).toEqual([
        ...finalizationEvents[index],
        ...Array.from({ length: 10 }, () => 'robot.actionResolved'),
        'cards.dealt',
      ])
    }
    const publicPayloads = JSON.stringify([activation.state, actions, executionStates, next.state, otherNext.state])
    for (const card of [...a.hand, ...b.hand, ...next.hand, ...otherNext.hand]) expect(publicPayloads).not.toContain(card.id)
    expect(await raw(first, update(next))).toEqual({ outcome: 'ACCEPTED' })
  })

  it.each([
    ['pause', 'GAME_PAUSED'],
    ['abort', 'GAME_ABORTED'],
  ] as const)('acknowledges %s rejection exactly once without broadcasting or mutation', async (transition, outcome) => {
    const first = await connect('Owner')
    const second = await connect('Peer')
    const [a] = await start([first, second])
    expect(await raw(first, update(a, full))).toEqual({ outcome: 'ACCEPTED' })
    await snapshot(first)
    await snapshot(second)
    const game = currentGame()
    const before = game.players.map((player) => game.registerViewsFor(player))
    const events: RegistersChanged[] = []
    for (const client of [first, second]) client.on('game.registersChanged', (event) => events.push(event))
    const acknowledgementIds: (number | undefined)[] = []
    // Observe decoded ACK packets, including duplicates ignored by emitWithAck.
    first.io.on('packet', (packet: { type: number; id?: number }) => {
      if (packet.type === 3) acknowledgementIds.push(packet.id)
    })
    game[transition]()
    const result = await raw(first, update(a))
    await snapshot(first)
    await snapshot(second)
    expect(result).toEqual({ outcome })
    expect(acknowledgementIds).toHaveLength(2) // Command ACK, then the membership.get barrier ACK.
    expect(new Set(acknowledgementIds).size).toBe(2)
    expect(events).toEqual([])
    expect(game.players.map((player) => game.registerViewsFor(player))).toEqual(before)
  })

  it('rejects occupancy during disconnected programming and execution', async () => {
    const first = await connect('A')
    const second = await connect('B')
    const [a, b] = await start([first, second])
    await raw(first, update(a, full))
    await raw(second, update(b, full))
    await disconnect(second)
    expect(await raw(first, update(a))).toEqual({ outcome: 'GAME_PAUSED' })
    const returning = await connect('B')
    await snapshot(returning)
    const game = currentGame()
    const execute = game.executeNextAction.bind(game)
    vi.spyOn(game, 'executeNextAction').mockImplementation(() => {
      const result = execute()
      game.pause()
      return result
    })
    const reveal = new Promise<RobotActionResolved>((resolve) => first.once('robot.actionResolved', resolve))
    await first.timeout(1000).emitWithAck('program.submit', program(a))
    await returning.timeout(1000).emitWithAck('program.submit', program(b))
    const action = await reveal
    const executed = await snapshot(first)
    const executedPlayer = executed.state.players.find((player) => player.playerId === action.playerId)!
    const actor = [a, b].find((joined) => joined.assignment.playerId === action.playerId)!
    expect(action).toMatchObject({
      gameId: a.assignment.gameId, playerId: actor.assignment.playerId,
      registerIndex: 0, instruction: actor.hand[0].instruction,
    })
    expect(executedPlayer.registers).toEqual([
      { status: 'REVEALED', instruction: action.instruction },
      { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' },
    ])
    // membership.get resumes a game with no disconnected members; activation still rejects edits.
    expect(executed.state.paused).toBe(false)
    expect(await raw(first, update(a))).toEqual({ outcome: 'WRONG_PHASE' })
    await disconnect(returning)
    const reconnected = await connect('B')
    const restored = await snapshot(reconnected)
    expect(restored.state.phase).toBe('EXECUTING')
    expect(restored.program).toEqual(b.hand.slice(0, 5))
    expect(restored.state.players.find((player) => player.playerId === executedPlayer.playerId)?.registers)
      .toEqual(executedPlayer.registers)
  })

  it('resets registers once resumed after a departure completes the final register', async () => {
    const createScheduler = actionScheduler.createActionScheduler
    let scheduler: actionScheduler.ActionScheduler | undefined
    vi.spyOn(actionScheduler, 'createActionScheduler').mockImplementation((deps) => {
      scheduler = createScheduler(deps)
      return scheduler
    })
    const first = await connect('A')
    const second = await connect('B')
    const joined = await start([first, second])
    await raw(first, update(joined[0], full))
    await raw(second, update(joined[1], full))
    const game = currentGame()
    const execute = game.executeNextAction.bind(game)
    let count = 0
    let lastActor = ''
    vi.spyOn(game, 'executeNextAction').mockImplementation(() => {
      const result = execute()
      count++
      lastActor = game.players.find((player) => player.robot.id === result.action.robotId)!.id
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
    expect(await departing.timeout(1000).emitWithAck('game.leave', {})).toEqual({ outcome: 'LEFT' })
    const nextHand = new Promise<void>((resolve) => remaining.once('cards.dealt', () => resolve()))
    game.resume()
    scheduler!.scheduleNextAction()
    await nextHand
    const restored = await snapshot(remaining)
    expect(restored.state.players.map((player) => player.registers)).toEqual([empty])
    expect(count).toBe(9)
  })

  it('preserves occupancy and private hands during authenticated Socket.IO recovery', async () => {
    const original = await connect('Recovering')
    const peer = await connect('Peer')
    const [initial, other] = await start([original, peer])
    expect(await raw(original, update(initial))).toEqual({ outcome: 'ACCEPTED' })
    const before = await snapshot(original)
    const disconnected = Promise.withResolvers<void>()
    server.sockets.sockets.get(original.id!)!.once('disconnect', () => disconnected.resolve())
    original.io.engine.close()
    await disconnected.promise
    const recovered = original
    await new Promise<void>((resolve, reject) => {
      recovered.once('connect', resolve)
      recovered.once('connect_error', reject)
      recovered.connect()
    })
    expect(recovered.recovered).toBe(true)
    const restored = await snapshot(recovered)
    expect(restored.assignment).toEqual(initial.assignment)
    expect(restored.hand).toEqual(initial.hand)
    expect(restored.program).toEqual(before.program)
    expect(restored.state.players[0].registers).toEqual(before.state.players[0].registers)
    expect((await snapshot(peer)).hand).toEqual(other.hand)
    for (const card of [...initial.hand, ...other.hand]) {
      expect(JSON.stringify(restored.state)).not.toContain(card.id)
    }
    const changed = Promise.withResolvers<RegistersChanged>()
    recovered.once('game.registersChanged', changed.resolve)
    expect(await raw(recovered, update(initial, [null, null, null, null, null]))).toEqual({ outcome: 'ACCEPTED' })
    expect(await changed.promise).toEqual({
      gameId: initial.assignment.gameId, playerId: initial.assignment.playerId, registers: empty,
    })
    expect((await snapshot(peer)).state.players.find((player) => player.playerId === initial.assignment.playerId)?.connected).toBe(true)
  })
})
