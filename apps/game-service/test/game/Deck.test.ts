import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card } from '@/game/Card'
import { Deck, HAND_SIZE, createDeckCards, createHand } from '@/game/Deck'
import { Board, Direction, EmptyTile, Game, Player, Robot, createGame } from '@/game/index'
import { Integer } from '@/numbers'

function counts(cards: readonly Card[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const card of cards) result[card.instruction] = (result[card.instruction] ?? 0) + 1
  return result
}

describe('createDeckCards', () => {
  it('matches the RoboRally 2017 composition with unique ids', () => {
    const cards = createDeckCards()
    expect(counts(cards)).toEqual({
      MOVE_1: 4, MOVE_2: 3, MOVE_3: 1, BACK_UP: 1,
      TURN_RIGHT: 4, TURN_LEFT: 4, U_TURN: 1, AGAIN: 1,
    })
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length)
  })
})

describe('Deck', () => {
  it('draws distinct cards from the draw pile', () => {
    const deck = new Deck(createDeckCards())
    const hand = createHand(deck)
    expect(hand).toHaveLength(HAND_SIZE)
    expect(new Set(hand.map((card) => card.id)).size).toBe(HAND_SIZE)
    expect(deck.size).toBe(createDeckCards().length - HAND_SIZE)
  })

  it('draws the remainder from the reshuffled discard pile when the draw pile runs short', () => {
    const cards = Array.from({ length: 12 }, (_, i) => new Card(`c${i}`, 'MOVE_1'))
    const deck = new Deck(cards)
    const first = deck.draw(9)
    deck.discard(first)
    const second = deck.draw(9)

    expect(second).toHaveLength(9)
    expect(new Set(second.map((card) => card.id)).size).toBe(9)
    const remaining = cards.filter((card) => !second.includes(card))
    expect(deck.size).toBe(remaining.length)
    expect(deck.discarded).toBe(0)
    // The 3 cards left in the draw pile are always drawn.
    const leftover = cards.filter((card) => !first.includes(card))
    expect(leftover.every((card) => second.includes(card))).toBe(true)
  })

  it('draws everything available when the deck cannot fill a hand', () => {
    const deck = new Deck([new Card('a', 'MOVE_1'), new Card('b', 'MOVE_2')])
    expect(deck.draw(9)).toHaveLength(2)
    expect(deck.isEmpty).toBe(true)
  })
})

describe('Game card cycle', () => {
  it('gives each player a private hand of nine and cycles cards through the discard pile', () => {
    const { game } = createGame('empty-map')
    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()
    expect(first.hand).toHaveLength(HAND_SIZE)
    const firstIds = new Set(first.hand.map((card) => card.id))
    expect(second.hand.some((card) => firstIds.has(card.id))).toBe(false)

    const program = first.hand.slice(0, 5).map((card) => card.id)
    expect(game.submitProgram(first.id, program).isOk()).toBe(true)
    expect(game.submitProgram(second.id, second.hand.slice(0, 5).map((card) => card.id)).isOk()).toBe(true)
    expect(game.phase).toBe('activation')
    for (let i = 0; i < 10; i++) game.executeNextAction()

    expect(game.phase).toBe('programming')
    expect(first.hand).toHaveLength(HAND_SIZE)
    // 19-card deck: 9 drawn, 10 left, so the next hand has no overlap with the previous one.
    expect(first.hand.some((card) => firstIds.has(card.id))).toBe(false)
  })
})

describe('Again card', () => {
  function run(instructions: Instruction[]) {
    const board = new Board([Array.from({ length: 9 }, () => new EmptyTile())], { x: Integer(8), y: Integer(0), angle: 0 })
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    const cards = instructions.map((instruction, index) => new Card(`card-${index}`, instruction))
    const game = new Game(board, [player], cards, { x: Integer(0), y: Integer(0) }, undefined, () => 0)
    game.submitProgram(player.id, cards.map((card) => card.id))._unsafeUnwrap()
    const results = cards.map(() => game.executeNextAction())
    return results.map(({ action }) => action.position.x)
  }

  it('repeats the previous register, including through consecutive Again cards', () => {
    expect(run(['MOVE_1', 'AGAIN', 'AGAIN', 'MOVE_2', 'AGAIN'])).toEqual([1, 2, 3, 5, 7])
  })

  it('does nothing in the first register', () => {
    expect(run(['AGAIN', 'MOVE_1', 'AGAIN', 'AGAIN', 'AGAIN'])).toEqual([0, 1, 2, 3, 4])
  })
})
