import { resolveRobotAction } from '../../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import { Card, Deck, createGame } from '@/domain/game/index'
import { UnsignedInteger } from '@/numbers'
import { addTestPlayer, createTestPlayer } from '../../fixtures.ts'

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
    const program = [cards[0], cards[1], cards[2], cards[3], cards[4]] as const

    player.updateRegisters(program)
    player.discard(player.hand.filter((card) => !program.includes(card)))
    player.clearHand()

    expect(player.hand).toEqual([])
    expect(player.registers).toEqual(program)

    player.drawHand()
    expect(player.hand).toEqual([cards[5]])
    player.discard(player.hand)

    player.discardProgram()
    player.drawHand()
    player.resetRegisters()

    expect(player.registers).toEqual([null, null, null, null, null])
    expect(player.hand).toHaveLength(6)
    expect(player.hand).toEqual(expect.arrayContaining(cards))
  })

  it('stores a frozen copy of its register cards, independent of hands and other players', () => {
    const card = new Card('move-1', 'MOVE_1')
    const first = createTestPlayer({ id: 'player-1', deck: new Deck([card]) })
    first.drawHand()
    const second = createTestPlayer({ id: 'player-2' })
    const blank = [null, null, null, null, null]
    expect(first.registers).toEqual(blank)

    const selection = [card, null, new Card('left-1', 'TURN_LEFT'), null, new Card('move-2', 'MOVE_1')] as const
    first.updateRegisters(selection)
    expect(first.registers).toEqual(selection)
    expect(first.registers).not.toBe(selection)
    expect(Object.isFrozen(first.registers)).toBe(true)
    expect(second.registers).toEqual(blank)
    expect(first.hand).toEqual([card])

    first.resetRegisters()
    expect(first.registers).toEqual(blank)
    expect(first.hand).toEqual([card])
  })

  it('returns the card held in each register, in the order it was programmed', () => {
    const cards = [
      new Card('move-1', 'MOVE_1'),
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-2', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('move-3', 'MOVE_1'),
    ]
    const player = createTestPlayer()
    player.updateRegisters([cards[0], cards[1], cards[2], cards[3], cards[4]])

    expect(player.cardInRegister(UnsignedInteger(0))).toBe(cards[0])
    expect(player.cardInRegister(UnsignedInteger(2))).toBe(cards[2])
    expect(player.cardInRegister(UnsignedInteger(4))).toBe(cards[4])
  })

  it('rejects reading an empty register or an index past the fifth', () => {
    const player = createTestPlayer()
    expect(() => player.cardInRegister(UnsignedInteger(0))).toThrow()

    const cards = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    player.updateRegisters([cards[0], cards[1], cards[2], cards[3], cards[4]])
    expect(() => player.cardInRegister(UnsignedInteger(5))).toThrow(RangeError)
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
    const player = addTestPlayer(game, 'red')
    player.completeCheckpoint(1)

    for (let round = 0; round < 2; round++) {
      const submitted = game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))
      expect(submitted.isOk()).toBe(true)
      for (let register = 0; register < 5; register++) resolveRobotAction(game)

      expect(game.lastActivePhase).toBe('programming')
      expect(player.registers).toEqual([null, null, null, null, null])
      expect(player.lastCheckpoint).toBe(1)
    }
  })
})
