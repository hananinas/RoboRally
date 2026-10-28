import { describe, expect, it } from 'vitest'
import { createGame } from '@/game/GameFactory'

const occupied = [true, false, true, false, true] as const
const empty = Array.from({ length: 5 }, () => ({ status: 'EMPTY' }))

describe('public register lifecycle', () => {
  it('keeps occupancy independent from private cards and preserves prior snapshots', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()
    const initial = first.registers
    expect(initial).toEqual(empty)
    expect(game.updateRegisters(first.id, occupied)).toEqual({ outcome: 'ACCEPTED' })
    const snapshot = first.registers
    expect(snapshot).toEqual([
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' },
      { status: 'EMPTY' }, { status: 'HIDDEN' },
    ])
    expect(initial).toEqual(empty)
    expect(second.registers).toEqual(empty)
    expect(first.robot.program).toEqual([])
    expect(game.hasSubmittedProgram(first.id)).toBe(false)
    game.updateRegisters(first.id, [false, false, false, false, false])
    expect(snapshot[0]).toEqual({ status: 'HIDDEN' })
    expect(first.registers).toEqual(empty)
  })

  it('rejects unavailable writes without changing slots or stored programs', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()
    game.updateRegisters(first.id, occupied)
    const registers = first.registers
    expect(game.updateRegisters('removed-player', occupied)).toEqual({ outcome: 'NOT_A_MEMBER' })
    game.pause()
    expect(game.updateRegisters(first.id, occupied)).toEqual({ outcome: 'WRONG_PHASE' })
    game.resume()
    game.submitProgram(first.id, first.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    const program = first.robot.program
    expect(game.updateRegisters(first.id, occupied)).toEqual({ outcome: 'ALREADY_SUBMITTED' })
    game.submitProgram(second.id, second.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    expect(game.updateRegisters(first.id, occupied)).toEqual({ outcome: 'WRONG_PHASE' })
    expect(first.registers).toBe(registers)
    expect(first.robot.program).toEqual(program)
  })

  it('reveals only the executed instruction and clears slots when programming starts', () => {
    const { game } = createGame('empty-map')
    const player = game.addPlayer()._unsafeUnwrap()
    game.updateRegisters(player.id, [true, true, true, true, true])
    game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    for (let index = 0; index < 5; index++) {
      const result = game.executeNextAction()
      expect(result.action.playerId).toBe(player.id)
      expect(result.registers).toEqual(Array.from({ length: 5 }, (_, slot) => slot <= index
        ? { status: 'REVEALED', instruction: player.hand[slot].instruction }
        : { status: 'HIDDEN' }))
      expect(result.registers[index]).not.toHaveProperty('id')
      expect(result.roundComplete).toBe(index === 4)
      expect(player.registers).toEqual(result.registers)
    }
    // The completed round keeps its reveals and stays in activation until programming starts.
    expect(game.phase).toBe('activation')
    expect(game.awaitingProgrammingStart).toBe(true)
    game.beginProgramming()
    expect(game.phase).toBe('programming')
    expect(player.registers).toEqual(empty)
    expect(game.hasSubmittedProgram(player.id)).toBe(false)
    expect(game.updateRegisters(player.id, occupied)).toEqual({ outcome: 'ACCEPTED' })
  })

  it('locks the roster at lobby start and preserves colours across departure', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer('#4d8deb')._unsafeUnwrap()
    expect(first.robot.colour).not.toBe(second.robot.colour)
    const colour = second.robot.colour
    game.start()
    expect(game.addPlayer()._unsafeUnwrapErr()).toBe('GAME_ALREADY_STARTED')
    game.removePlayer(first.id)
    expect(game.players).toEqual([second])
    expect(second.robot.colour).toBe(colour)
    expect(game.updateRegisters(first.id, occupied)).toEqual({ outcome: 'NOT_A_MEMBER' })
  })
})
