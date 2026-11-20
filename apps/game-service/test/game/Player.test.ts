import { resolveRobotAction } from '../activationTestHelper.ts'
import { describe, expect, it } from 'vitest'
import { Deck, Direction, Card, Player, Robot, createGame } from '@/game/index'

describe('Player', () => {
  it('keeps its robot and manages hands through its private deck', () => {
    const robot = new Robot('robot-1', Direction.EAST)
    const firstHand = [new Card('move-1', 'MOVE_1')]
    const player = new Player('player-1', robot, new Deck(firstHand))
    player.drawHand(() => 0)
    firstHand.pop()

    expect(player.id).toBe('player-1')
    expect(player.robot).toBe(robot)
    expect(player.hand.map((card) => card.id)).toEqual(['move-1'])

    const nextHand = [new Card('left-1', 'TURN_LEFT')]
    player.discard(player.hand)
    expect(player.hand).toEqual([])
    player.deck.add(nextHand)
    player.drawHand(() => 0)
    nextHand.pop()
    // New cards are drawn first, then the discard pile is recycled.
    expect(player.hand.map((card) => card.id)).toEqual(['left-1', 'move-1'])
  })

  it('moves programmed cards to the registers on submit and discards them at round end', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => new Card(id, 'MOVE_1'))
    const player = new Player('player-1', new Robot('robot-1', Direction.EAST), new Deck(cards))
    player.drawHand(() => 0, 6)
    const program = cards.slice(0, 5)

    player.robot.setProgram(program)
    player.discard(player.hand.filter((card) => !program.includes(card)))
    player.clearHand()

    expect(player.hand).toEqual([])
    expect(player.robot.program).toEqual(program)
    expect(player.deck.discarded).toBe(1)
    expect(player.deck.size).toBe(0)

    player.discard(player.robot.program)
    player.robot.clearProgram()

    expect(player.robot.program).toEqual([])
    expect(player.deck.discarded).toBe(6)
  })

  it('keeps immutable register snapshots independent from hands and other players', () => {
    const card = new Card('move-1', 'MOVE_1')
    const first = new Player('player-1', new Robot('robot-1', Direction.EAST), new Deck([card]))
    first.drawHand(() => 0)
    const second = new Player('player-2', new Robot('robot-2', Direction.EAST))
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
    const first = new Player('player-1', new Robot('robot-1', Direction.EAST))
    const second = new Player('player-2', new Robot('robot-2', Direction.EAST))

    expect(first.lastCheckpoint).toBe(0)
    expect(second.lastCheckpoint).toBe(0)
    expect(first.completeCheckpoint(1)).toBe(true)
    expect(first.lastCheckpoint).toBe(1)
    expect(second.lastCheckpoint).toBe(0)
    expect(second.completeCheckpoint(1)).toBe(true)
    expect(second.lastCheckpoint).toBe(1)
  })

  it('only records the next checkpoint, without repeating, skipping or losing progress', () => {
    const player = new Player('player-1', new Robot('robot-1', Direction.EAST))

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
      const player = new Player('player-1', new Robot('robot-1', Direction.EAST))

      expect(player.completeCheckpoint(checkpointNumber)).toBe(false)
      expect(player.lastCheckpoint).toBe(0)
    },
  )

  it('preserves checkpoint progress across rounds and program clearing', () => {
    const { game } = createGame('empty-map')
    const player = game.addPlayer()._unsafeUnwrap()
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
