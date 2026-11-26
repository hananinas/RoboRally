import { describe, expect, it } from 'vitest'
import { createGame, type Player } from '@/domain/game/index'
import { createGameRecorder } from '@/socket/gameSession/gameRecorder'
import type { Seat } from '@/socket/gameSession/GameSession'
import { addTestPlayer } from '../../fixtures.ts'
import { createFakeGameRepository } from '../../repositoryTestHelper.ts'

const GAME_NAME = 'Friday night'
const MAP_NAME = 'test-map'

function seatFor(player: Player, username: string): Seat {
  return {
    user: { userId: `user-${username}`, username },
    player,
    connectionId: `connection-${username}`,
  }
}

function createRecorder() {
  const game = createGame(MAP_NAME, GAME_NAME)
  const players = [addTestPlayer(game, 'red'), addTestPlayer(game, 'blue')]
  const seats = players.map((player, index) => seatFor(player, ['red', 'blue'][index]))
  const repository = createFakeGameRepository()
  const recorder = createGameRecorder({ repository, game, mapName: MAP_NAME, seats: () => seats })
  return { game, players, repository, recorder }
}

describe('gameRecorder', () => {
  it('saves the snapshot with the identity of every seat', () => {
    const { game, players, repository, recorder } = createRecorder()

    recorder.saveState()

    expect(repository.saveRound).toHaveBeenCalledTimes(1)
    expect(repository.saveRound).toHaveBeenCalledWith(game.id, GAME_NAME, MAP_NAME, game.snapshot, [
      { playerId: players[0].id, userId: 'user-red', username: 'red' },
      { playerId: players[1].id, userId: 'user-blue', username: 'blue' },
    ])
  })

  it('keeps the last state with players when the roster empties', () => {
    const { game, players, repository, recorder } = createRecorder()

    for (const player of players) game.removePlayer(player.id)
    recorder.saveState()

    expect(repository.saveRound).not.toHaveBeenCalled()
  })

  it('records the winner with the final state', () => {
    const { game, players, repository, recorder } = createRecorder()

    recorder.saveFinished(players[0].id)

    expect(repository.saveFinished).toHaveBeenCalledWith(
      game.id, GAME_NAME, MAP_NAME, game.snapshot, expect.any(Array), players[0].id,
    )
  })

  it('records an abort without touching the stored state', () => {
    const { game, repository, recorder } = createRecorder()

    recorder.saveAborted()

    expect(repository.saveAborted).toHaveBeenCalledWith(game.id)
    expect(repository.saveRound).not.toHaveBeenCalled()
  })

  it('records a departure against the game', () => {
    const { game, players, repository, recorder } = createRecorder()

    recorder.markPlayerLeft(players[1].id)

    expect(repository.markPlayerLeft).toHaveBeenCalledWith(game.id, players[1].id)
  })

  it('never lets a storage failure reach the caller', () => {
    const { repository, recorder } = createRecorder()
    repository.saveRound.mockImplementation(() => {
      throw new Error('database is locked')
    })

    expect(() => recorder.saveState()).not.toThrow()
  })
})
