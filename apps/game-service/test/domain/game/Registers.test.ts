import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card, Registers } from '@/domain/game/index'
import { UnsignedInteger } from '@/numbers'

const registers = (...instructions: (Instruction | null)[]) =>
  Registers.of(instructions.map((instruction, index) =>
    instruction === null ? null : new Card(`card-${index}`, instruction)))

const program = () => registers('MOVE_1', 'MOVE_2', 'MOVE_3', 'TURN_LEFT', 'TURN_RIGHT')

const hidden = { kind: 'hidden' }
const blank = { kind: 'empty' }
const revealed = (instruction: Instruction) => ({ kind: 'revealed', instruction })

describe('Registers', () => {
  it('rejects anything but five slots', () => {
    expect(() => Registers.of([])).toThrow(RangeError)
    expect(() => Registers.of([null, null, null, null])).toThrow(RangeError)
    expect(() => Registers.of([null, null, null, null, null, null])).toThrow(RangeError)
  })

  it('starts empty and keeps the cards it is written with', () => {
    expect(Registers.empty().slots).toEqual([null, null, null, null, null])
    expect(program().slots.map((card) => card?.instruction))
      .toEqual(['MOVE_1', 'MOVE_2', 'MOVE_3', 'TURN_LEFT', 'TURN_RIGHT'])
  })

  it('does not follow later changes to the array it was given', () => {
    const cards = [new Card('a', 'MOVE_1'), null, null, null, null]
    const written = Registers.of(cards)
    cards.reverse()

    expect(written.slots[0]?.id).toBe('a')
  })

  it('returns the card held in each register', () => {
    const filled = program()

    expect(filled.cardAt(UnsignedInteger(0)).instruction).toBe('MOVE_1')
    expect(filled.cardAt(UnsignedInteger(2)).instruction).toBe('MOVE_3')
    expect(filled.cardAt(UnsignedInteger(4)).instruction).toBe('TURN_RIGHT')
  })

  it('rejects reading an empty register or an index past the fifth', () => {
    expect(() => Registers.empty().cardAt(UnsignedInteger(0))).toThrow()
    expect(() => program().cardAt(UnsignedInteger(5))).toThrow(RangeError)
  })

  it('is only a program once every register is filled', () => {
    expect(program().program.map((card) => card.instruction))
      .toEqual(['MOVE_1', 'MOVE_2', 'MOVE_3', 'TURN_LEFT', 'TURN_RIGHT'])
    expect(() => registers('MOVE_1', null, 'MOVE_3', null, 'TURN_RIGHT').program).toThrow(RangeError)
    expect(() => Registers.empty().program).toThrow(RangeError)
  })
})

describe('Registers public view', () => {
  it.each([
    {
      state: 'an untouched programming board',
      registers: Registers.empty(), registerIndex: 0, hasActed: false,
      expected: [blank, blank, blank, blank, blank],
    },
    {
      state: 'a partly filled programming board',
      registers: registers('MOVE_1', null, 'MOVE_3', null, 'TURN_RIGHT'), registerIndex: 0, hasActed: false,
      expected: [hidden, blank, hidden, blank, hidden],
    },
    {
      state: 'a submitted program before the robot acts',
      registers: program(), registerIndex: 0, hasActed: false,
      expected: [hidden, hidden, hidden, hidden, hidden],
    },
    {
      state: 'the first register once its robot has acted',
      registers: program(), registerIndex: 0, hasActed: true,
      expected: [revealed('MOVE_1'), hidden, hidden, hidden, hidden],
    },
    {
      state: 'a robot waiting its turn in the third register',
      registers: program(), registerIndex: 2, hasActed: false,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), hidden, hidden, hidden],
    },
    {
      state: 'a robot that has acted in the third register',
      registers: program(), registerIndex: 2, hasActed: true,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), revealed('MOVE_3'), hidden, hidden],
    },
    {
      state: 'a round played to its end',
      registers: program(), registerIndex: 5, hasActed: false,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), revealed('MOVE_3'), revealed('TURN_LEFT'), revealed('TURN_RIGHT')],
    },
    {
      state: 'a round won on the fourth register, leaving the fifth unplayed',
      registers: program(), registerIndex: 4, hasActed: false,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), revealed('MOVE_3'), revealed('TURN_LEFT'), hidden],
    },
  ])('describes $state', ({ registers, registerIndex, hasActed, expected }) => {
    expect(registers.publicView(registerIndex, hasActed)).toEqual(expected)
  })
})
