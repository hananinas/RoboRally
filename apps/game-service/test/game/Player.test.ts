import { resolveRobotAction } from '../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import { Card, Deck, createGame } from '@/game/index'
import { createTestPlayer } from '../fixtures.ts'

describe('Player', () => {
  it('keeps its robot and manages hands through its private deck', () => {
    const card = new Card('move-1', 'MOVE_1')
    const player = createTestPlayer({ id: 'player-1', deck: new Deck([card]) })
    player.drawHand()

    expect(player.id).toBe('player-1')
    expect(player.hand).toEqual([card])

    player.discard(player.hand)
    expect(player.hand).toEqual([])

    player.drawHand()
    expect(player.hand).toEqual([card])
  })

  it('moves programmed cards to the registers on submit and discards them at round end', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => new Card(id, 'MOVE_1'))
    const player = createTestPlayer({ id: 'player-1', deck: new Deck(cards) })
    player.drawHand()
    const program = cards.slice(0, 5)

    player.robot.setProgram(program)
    player.discard(player.hand.filter((card) => !program.includes(card)))
    player.clearHand()

    expect(player.hand).toEqual([])
    expect(player.robot.program).toEqual(program)

    player.drawHand()
    expect(player.hand).toEqual([cards[5]])
    player.discard(player.hand)

    player.discard(player.robot.program)
    player.robot.clearProgram()
    player.drawHand()

    expect(player.robot.program).toEqual([])
    expect(player.hand).toHaveLength(6)
    expect(player.hand).toEqual(expect.arrayContaining(cards))
  })

  it('keeps immutable register snapshots independent from hands and other players', () => {
    const card = new Card('move-1', 'MOVE_1')
    const first = createTestPlayer({ id: 'player-1', deck: new Deck([card]) })
    first.drawHand()
    const second = createTestPlayer({ id: 'player-2' })
    const empty = Array.from({ length: 5 }, () => ({ status: 'EMPTY' }))
    const initial = first.registers
    expect(initial).toEqual(empty)

    const selection = [card, null, new Card('left-1', 'TURN_LEFT'), null, new Card('move-2', 'MOVE_1')] as const
    first.updateRegisters(selection)
    expect(first.program).toEqual(selection)
    expect(first.program).not.toBe(selection)
    expect(Object.isFrozen(first.program)).toBe(true)
    const occupied = first.registers
    expect(occupied).toEqual([
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'HIDDEN' },
      { status: 'EMPTY' }, { status: 'HIDDEN' },
    ])
    expect(initial).toEqual(empty)
    expect(second.registers).toEqual(empty)
    expect(first.hand).toEqual([card])
    expect(first.robot.program).toEqual([])
    expect(Object.isFrozen(occupied)).toBe(true)
    expect(occupied.every(Object.isFrozen)).toBe(true)

    const revealed = first.revealRegister(2, card.instruction)
    expect(first.program).toEqual(selection)
    expect(first.registers).toBe(revealed)
    expect(revealed).toEqual([
      { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'REVEALED', instruction: 'MOVE_1' },
      { status: 'EMPTY' }, { status: 'HIDDEN' },
    ])
    expect(occupied[2]).toEqual({ status: 'HIDDEN' })
    expect(Object.isFrozen(revealed)).toBe(true)
    expect(revealed.every(Object.isFrozen)).toBe(true)

    first.resetRegisters()
    expect(first.registers).toEqual(empty)
    expect(first.program).toEqual([null, null, null, null, null])
    expect(revealed[2]).toEqual({ status: 'REVEALED', instruction: 'MOVE_1' })
    expect(first.hand).toEqual([card])
  })

  it('starts each player at checkpoint zero and tracks their progress independently', () => {
    const first = createTestPlayer()
    const second = createTestPlayer()

    expect(first.lastCheckpoint).toBe(0)
    expect(second.lastCheckpoint).toBe(0)
    expect(first.completeCheckpoint(1)).toBe(true)
    expect(first.lastCheckpoint).toBe(1)
    expect(second.lastCheckpoint).toBe(0)
    expect(second.completeCheckpoint(1)).toBe(true)
    expect(second.lastCheckpoint).toBe(1)
  })

  it('only records the next checkpoint, without repeating, skipping or losing progress', () => {
    const player = createTestPlayer()

    expect(player.completeCheckpoint(2)).toBe(false)
    expect(player.lastCheckpoint).toBe(0)
    expect(player.completeCheckpoint(1)).toBe(true)
    expect(player.completeCheckpoint(1)).toBe(false)
    expect(player.completeCheckpoint(3)).toBe(false)
    expect(player.lastCheckpoint).toBe(1)
    expect(player.completeCheckpoint(2)).toBe(true)
    expect(player.completeCheckpoint(1)).toBe(false)
    expect(player.lastCheckpoint).toBe(2)
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid checkpoint number %s without changing progress',
    (checkpointNumber) => {
      const player = createTestPlayer()

      expect(player.completeCheckpoint(checkpointNumber)).toBe(false)
      expect(player.lastCheckpoint).toBe(0)
    },
  )

  it('preserves checkpoint progress across rounds and program clearing', () => {
    const game = createGame('empty-map', 'Test game')
    const player = game.addPlayer('red')._unsafeUnwrap()
    player.completeCheckpoint(1)

    for (let round = 0; round < 2; round++) {
      game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
      for (let register = 0; register < 5; register++) resolveRobotAction(game)

      expect(game.lastActivePhase).toBe('programming')
      expect(player.robot.program).toEqual([])
      expect(player.lastCheckpoint).toBe(1)
    }
  })
})
