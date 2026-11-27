import { describe, expect, it } from 'vitest'
import { DECK_INSTRUCTIONS, HAND_SIZE, createGame, type PlayerSnapshot } from '@/domain/game/index'
import { resolveRobotAction } from '../../activationTestHelper.ts'
import { addTestPlayer } from '../../fixtures.ts'

function heldCardIds(player: PlayerSnapshot): Set<string> {
  return new Set([...player.hand, ...player.deck.drawPile, ...player.deck.discardPile].map((card) => card.id))
}

describe('Game.snapshot', () => {
  it('holds the same cards after a round as when they were dealt', () => {
    const game = createGame('empty-map', 'Snapshot game')
    const red = addTestPlayer(game, 'red')
    const blue = addTestPlayer(game, 'blue')

    const dealt = game.snapshot
    expect(dealt.completedRounds).toBe(0)
    expect(dealt.players.map((player) => player.playerId)).toEqual([red.id, blue.id])
    for (const player of dealt.players) {
      expect(player.hand).toHaveLength(HAND_SIZE)
      expect(heldCardIds(player).size).toBe(DECK_INSTRUCTIONS.length)
    }

    for (const player of [red, blue]) {
      game.submitProgram(player.id, player.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()
    }
    while (game.requirePhase('activation').isOk()) resolveRobotAction(game)

    const played = game.snapshot
    expect(played.completedRounds).toBe(1)
    expect(played.players.map(heldCardIds)).toEqual(dealt.players.map(heldCardIds))
  })

  it('refuses to describe a game while cards sit in registers', () => {
    const game = createGame('empty-map', 'Snapshot game')
    const red = addTestPlayer(game, 'red')
    addTestPlayer(game, 'blue')

    game.submitProgram(red.id, red.hand.slice(0, 5).map((card) => card.id))._unsafeUnwrap()

    expect(() => game.snapshot).toThrow(/registers/)
  })
})
