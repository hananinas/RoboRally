import { resolveRobotAction } from '../../activationTestHelper.js'
import { describe, expect, it } from 'vitest'
import type { Game, UpdateRegistersError } from '@/domain/game/Game'
import type { Player } from '@/domain/game/Player'
import { createGame } from '@/domain/game/GameFactory'
import { addTestPlayer } from '../../fixtures.ts'

const selection = (player: Player) => [player.hand[0].id, null, player.hand[2].id, null, player.hand[4].id] as const
const empty = Array.from({ length: 5 }, () => ({ kind: 'empty' }))

function expectRejectedWithoutMutation(game: Game, playerId: string, error: UpdateRegistersError) {
  const players = game.players
  const state = () => ({
    phase: game.lastActivePhase,
    currentRegister: game.currentRegister,
    paused: game.paused,
    aborted: game.aborted,
    winner: game.winner,
    players: game.players.map((player) => ({
      id: player.id,
      views: game.registerViewsFor(player),
      registers: player.registers,
      hand: player.hand,
      submitted: game.hasSubmittedProgram(player.id),
      lastCheckpoint: player.lastCheckpoint,
      direction: player.robot.direction,
      position: game.getRobotPosition(player.robot.id),
    })),
  })
  const before = state()

  expect(game.updateRegisters(playerId, [null, null, null, null, null])._unsafeUnwrapErr()).toBe(error)

  expect(game.players).toEqual(players)
  expect(state()).toEqual(before)
}

describe('public register lifecycle', () => {

  it('stores private selections without submitting them', () => {
    const game = createGame('empty-map', 'Test game')
    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, 'blue')
    const hand = first.hand
    expect(game.registerViewsFor(first)).toEqual(empty)
    expect(game.updateRegisters(first.id, selection(first))._unsafeUnwrap()).toBeUndefined()
    expect(game.registerViewsFor(first)).toEqual([
      { kind: 'hidden' }, { kind: 'empty' }, { kind: 'hidden' },
      { kind: 'empty' }, { kind: 'hidden' },
    ])
    expect(game.registerViewsFor(second)).toEqual(empty)
    expect(first.registers).toEqual([hand[0], null, hand[2], null, hand[4]])
    expect(first.hand).toEqual(hand)
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(game.hasSubmittedProgram(first.id)).toBe(false)
    expect(game.updateRegisters(first.id, [null, null, null, null, null])._unsafeUnwrap()).toBeUndefined()
    expect(game.registerViewsFor(first)).toEqual(empty)
    expect(first.registers).toEqual([null, null, null, null, null])
  })

  it('rejects unavailable writes without changing slots or stored programs', () => {
    const game = createGame('empty-map', 'Test game')
    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, 'blue')
    game.updateRegisters(first.id, selection(first))._unsafeUnwrap()
    expectRejectedWithoutMutation(game, 'removed-player', 'PLAYER_NOT_IN_GAME')
    game.pause()
    expectRejectedWithoutMutation(game, first.id, 'GAME_PAUSED')
    game.resume()
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    const program = first.registers
    expect(game.registerViewsFor(first)).toEqual(Array.from({ length: 5 }, () => ({ kind: 'hidden' })))
    expectRejectedWithoutMutation(game, first.id, 'ALREADY_SUBMITTED')
    game.submitProgram(second.id, second.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    expectRejectedWithoutMutation(game, first.id, 'WRONG_PHASE')
    expect(first.registers).toEqual(program)
  })

  it('rejects register updates after aborting', () => {
    const game = createGame('empty-map', 'Test game')
    const player = addTestPlayer(game, 'red')
    game.updateRegisters(player.id, selection(player))._unsafeUnwrap()
    game.abort()

    expect(game.lastActivePhase).toBe('programming')
    expectRejectedWithoutMutation(game, player.id, 'GAME_ABORTED')
  })

  it('checks lifecycle restrictions before membership and submission without mutating state', () => {
    const game = createGame('empty-map', 'Test game')
    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, 'blue')
    for (const player of [first, second]) game.updateRegisters(player.id, selection(player))._unsafeUnwrap()
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expectRejectedWithoutMutation(game, 'missing-player', 'PLAYER_NOT_IN_GAME')
    expectRejectedWithoutMutation(game, first.id, 'ALREADY_SUBMITTED')
    game.pause()
    expectRejectedWithoutMutation(game, first.id, 'GAME_PAUSED')
    expectRejectedWithoutMutation(game, 'missing-player', 'GAME_PAUSED')
    game.resume()
    game.submitProgram(second.id, second.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(game.lastActivePhase).toBe('activation')
    expectRejectedWithoutMutation(game, first.id, 'WRONG_PHASE')
    expectRejectedWithoutMutation(game, 'missing-player', 'WRONG_PHASE')
    game.pause()
    expectRejectedWithoutMutation(game, first.id, 'GAME_PAUSED')
    expectRejectedWithoutMutation(game, 'missing-player', 'GAME_PAUSED')
    game.abort()
    expect(game.paused).toBe(false)
    expect(game.aborted).toBe(true)
    expectRejectedWithoutMutation(game, first.id, 'GAME_ABORTED')
    expectRejectedWithoutMutation(game, 'missing-player', 'GAME_ABORTED')
  })

  it('reveals only the executed instruction and clears slots when the next hand is dealt', () => {
    const game = createGame('empty-map', 'Test game')
    const player = addTestPlayer(game, 'red')
    const hand = player.hand
    game.updateRegisters(player.id, hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    game.submitProgram(player.id, hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    for (let index = 0; index < 5; index++) {
      const result = resolveRobotAction(game)
      const views = game.registerViewsFor(player)
      expect(result.action.robotId).toBe(player.robot.id)
      expect(views).toEqual(index === 4 ? empty : Array.from({ length: 5 }, (_, slot) => slot <= index
        ? { kind: 'revealed', instruction: hand[slot].instruction }
        : { kind: 'hidden' }))
      expect(views[index]).not.toHaveProperty('id')
      expect(game.lastActivePhase).toBe(index === 4 ? 'programming' : 'activation')
    }
    expect(game.lastActivePhase).toBe('programming')
    expect(game.registerViewsFor(player)).toEqual(empty)
    expect(game.hasSubmittedProgram(player.id)).toBe(false)
    expect(player.registers).toEqual([null, null, null, null, null])
    expect(game.updateRegisters(player.id, selection(player))._unsafeUnwrap()).toBeUndefined()
  })

  it('preserves colours across departure', () => {
    const game = createGame('empty-map', 'Test game')
    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, '#4d8deb')
    expect(first.robot.colour).not.toBe(second.robot.colour)
    const colour = second.robot.colour
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    game.removePlayer(first.id)
    expect(game.players).toEqual([second])
    expect(second.robot.colour).toBe(colour)
    expectRejectedWithoutMutation(game, first.id, 'PLAYER_NOT_IN_GAME')
  })
})
