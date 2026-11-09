import { describe, expect, it } from 'vitest'
import type { Game, UpdateRegistersError } from '@/game/Game'
import { createGame } from '@/game/GameFactory'

const occupied = [true, false, true, false, true] as const
const empty = Array.from({ length: 5 }, () => ({ status: 'EMPTY' }))

function expectRejectedWithoutMutation(game: Game, playerId: string, error: UpdateRegistersError) {
  const players = game.players
  const registers = players.map((player) => player.registers)
  const state = () => ({
    phase: game.phase,
    currentRegister: game.currentRegister,
    hasStarted: game.hasStarted,
    paused: game.paused,
    aborted: game.aborted,
    winner: game.winner,
    players: game.players.map((player) => ({
      id: player.id,
      registers: player.registers.map((register) => ({ ...register })),
      program: player.robot.program,
      hand: player.hand,
      submitted: game.hasSubmittedProgram(player.id),
      lastCheckpoint: player.lastCheckpoint,
      direction: player.robot.direction,
      position: game.board.positionOf(player.robot.id),
    })),
  })
  const before = state()

  expect(game.updateRegisters(playerId, [false, false, false, false, false])._unsafeUnwrapErr()).toBe(error)

  expect(game.players).toEqual(players)
  players.forEach((player, index) => expect(player.registers).toBe(registers[index]))
  expect(state()).toEqual(before)
}

describe('public register lifecycle', () => {
  it('keeps occupancy independent from private cards and preserves prior snapshots', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()
    const initial = first.registers
    const hand = first.hand
    expect(initial).toEqual(empty)
    expect(game.updateRegisters(first.id, occupied)._unsafeUnwrap()).toBeUndefined()
    const snapshot = first.registers
    expect(snapshot).toEqual([
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' },
      { status: 'EMPTY' }, { status: 'HIDDEN' },
    ])
    expect(initial).toEqual(empty)
    expect(second.registers).toEqual(empty)
    expect(first.robot.program).toEqual([])
    expect(first.hand).toEqual(hand)
    expect(game.phase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(game.hasStarted).toBe(false)
    expect(game.hasSubmittedProgram(first.id)).toBe(false)
    expect(game.updateRegisters(first.id, [false, false, false, false, false])._unsafeUnwrap()).toBeUndefined()
    expect(snapshot[0]).toEqual({ status: 'HIDDEN' })
    expect(first.registers).toEqual(empty)
  })

  it('rejects unavailable writes without changing slots or stored programs', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()
    game.updateRegisters(first.id, occupied)._unsafeUnwrap()
    const registers = first.registers
    expectRejectedWithoutMutation(game, 'removed-player', 'PLAYER_NOT_IN_GAME')
    game.pause()
    expectRejectedWithoutMutation(game, first.id, 'GAME_PAUSED')
    game.resume()
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    const program = first.robot.program
    expectRejectedWithoutMutation(game, first.id, 'ALREADY_SUBMITTED')
    game.submitProgram(second.id, second.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    expectRejectedWithoutMutation(game, first.id, 'WRONG_PHASE')
    expect(first.registers).toBe(registers)
    expect(first.robot.program).toEqual(program)
  })

  it('rejects register updates after aborting without changing the snapshot', () => {
    const { game } = createGame('empty-map')
    const player = game.addPlayer()._unsafeUnwrap()
    game.updateRegisters(player.id, occupied)._unsafeUnwrap()
    const snapshot = player.registers
    game.abort()

    expect(game.phase).toBe('programming')
    expectRejectedWithoutMutation(game, player.id, 'GAME_ABORTED')
    expect(player.registers).toBe(snapshot)
  })

  it('checks lifecycle restrictions before membership and submission without mutating state', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()
    for (const player of [first, second]) game.updateRegisters(player.id, occupied)._unsafeUnwrap()
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expectRejectedWithoutMutation(game, 'missing-player', 'PLAYER_NOT_IN_GAME')
    expectRejectedWithoutMutation(game, first.id, 'ALREADY_SUBMITTED')
    game.pause()
    expectRejectedWithoutMutation(game, first.id, 'GAME_PAUSED')
    expectRejectedWithoutMutation(game, 'missing-player', 'GAME_PAUSED')
    game.resume()
    game.submitProgram(second.id, second.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(game.phase).toBe('activation')
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
    const { game } = createGame('empty-map')
    const player = game.addPlayer()._unsafeUnwrap()
    game.updateRegisters(player.id, [true, true, true, true, true])._unsafeUnwrap()
    game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    for (let index = 0; index < 5; index++) {
      const result = game.executeNextAction()
      expect(result.action.robotId).toBe(player.robot.id)
      expect(result.registers).toEqual(Array.from({ length: 5 }, (_, slot) => slot <= index
        ? { status: 'REVEALED', instruction: player.hand[slot].instruction }
        : { status: 'HIDDEN' }))
      expect(result.registers[index]).not.toHaveProperty('id')
      expect(player.registers).toEqual(index === 4 ? empty : result.registers)
      expect(game.phase).toBe(index === 4 ? 'programming' : 'activation')
    }
    expect(game.phase).toBe('programming')
    expect(player.registers).toEqual(empty)
    expect(game.hasSubmittedProgram(player.id)).toBe(false)
    expect(game.updateRegisters(player.id, occupied)._unsafeUnwrap()).toBeUndefined()
  })

  it('locks the roster after program submission and preserves colours across departure', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer('#4d8deb')._unsafeUnwrap()
    expect(first.robot.colour).not.toBe(second.robot.colour)
    const colour = second.robot.colour
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    expect(game.addPlayer()._unsafeUnwrapErr()).toBe('GAME_ALREADY_STARTED')
    game.removePlayer(first.id)
    expect(game.players).toEqual([second])
    expect(second.robot.colour).toBe(colour)
    expectRejectedWithoutMutation(game, first.id, 'PLAYER_NOT_IN_GAME')
  })
})
