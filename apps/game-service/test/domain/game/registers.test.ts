import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { registerViews } from '@/domain/game/index'

const slots = (...instructions: (Instruction | null)[]) =>
  instructions.map((instruction) => instruction === null ? null : { instruction })

const program = slots('MOVE_1', 'MOVE_2', 'MOVE_3', 'TURN_LEFT', 'TURN_RIGHT')
const empty = slots(null, null, null, null, null)

const hidden = { kind: 'hidden' }
const blank = { kind: 'empty' }
const revealed = (instruction: Instruction) => ({ kind: 'revealed', instruction })

describe('registerViews', () => {
  it.each([
    {
      state: 'an untouched programming board',
      registers: empty, registerIndex: 0, hasActed: false,
      expected: [blank, blank, blank, blank, blank],
    },
    {
      state: 'a partly filled programming board',
      registers: slots('MOVE_1', null, 'MOVE_3', null, 'TURN_RIGHT'), registerIndex: 0, hasActed: false,
      expected: [hidden, blank, hidden, blank, hidden],
    },
    {
      state: 'a submitted program before the robot acts',
      registers: program, registerIndex: 0, hasActed: false,
      expected: [hidden, hidden, hidden, hidden, hidden],
    },
    {
      state: 'the first register once its robot has acted',
      registers: program, registerIndex: 0, hasActed: true,
      expected: [revealed('MOVE_1'), hidden, hidden, hidden, hidden],
    },
    {
      state: 'a robot waiting its turn in the third register',
      registers: program, registerIndex: 2, hasActed: false,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), hidden, hidden, hidden],
    },
    {
      state: 'a robot that has acted in the third register',
      registers: program, registerIndex: 2, hasActed: true,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), revealed('MOVE_3'), hidden, hidden],
    },
    {
      state: 'a round played to its end',
      registers: program, registerIndex: 5, hasActed: false,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), revealed('MOVE_3'), revealed('TURN_LEFT'), revealed('TURN_RIGHT')],
    },
    {
      state: 'a round won on the fourth register, leaving the fifth unplayed',
      registers: program, registerIndex: 4, hasActed: false,
      expected: [revealed('MOVE_1'), revealed('MOVE_2'), revealed('MOVE_3'), revealed('TURN_LEFT'), hidden],
    },
  ])('describes $state', ({ registers, registerIndex, hasActed, expected }) => {
    expect(registerViews(registers, registerIndex, hasActed)).toEqual(expected)
  })
})
