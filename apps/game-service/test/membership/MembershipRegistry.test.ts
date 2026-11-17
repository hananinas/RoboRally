import { describe, expect, it } from 'vitest'
import type { User } from '@robo-rally/game-events'
import type { MembershipContext } from '@/socket/gameMembership'
import { Lobby } from '@/membership/Lobby'
import { MembershipRegistry } from '@/membership/MembershipRegistry'

function user(userId: string): User {
  return { userId, username: userId }
}

function fakeGameContext(gameId: string): MembershipContext {
  return { game: { id: gameId } } as unknown as MembershipContext
}

describe('MembershipRegistry', () => {
  it('tracks lobbies independently of active membership', () => {
    const registry = new MembershipRegistry()
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    registry.addLobby(lobby)

    expect(registry.getLobby(lobby.lobbyId)).toBe(lobby)
    expect(registry.lobbies).toEqual([lobby])

    registry.removeLobby(lobby.lobbyId)
    expect(registry.getLobby(lobby.lobbyId)).toBeUndefined()
    expect(registry.lobbies).toEqual([])
  })

  it("resolves a user's current lobby or game through their active membership", () => {
    const registry = new MembershipRegistry()
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    registry.addLobby(lobby)
    registry.setActiveMembership('owner', { kind: 'lobby', lobbyId: lobby.lobbyId })

    expect(registry.getActiveMembership('owner')).toEqual({ kind: 'lobby', lobbyId: lobby.lobbyId })
    expect(registry.getCurrentLobby('owner')).toBe(lobby)
    expect(registry.getCurrentGame('owner')).toBeUndefined()
    expect(registry.getCurrentLobby('stranger')).toBeUndefined()

    registry.clearActiveMembership('owner')
    expect(registry.getActiveMembership('owner')).toBeUndefined()
    expect(registry.getCurrentLobby('owner')).toBeUndefined()
  })

  it('promotes a lobby to a game, moving every member, then removes the game by id', () => {
    const registry = new MembershipRegistry()
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    lobby.addMember(user('second'), 'connection-2')
    registry.addLobby(lobby)
    registry.setActiveMembership('owner', { kind: 'lobby', lobbyId: lobby.lobbyId })
    registry.setActiveMembership('second', { kind: 'lobby', lobbyId: lobby.lobbyId })

    const gameContext = fakeGameContext('game-1')
    registry.promoteLobbyToGame(lobby, gameContext, ['owner', 'second'])

    expect(registry.getLobby(lobby.lobbyId)).toBeUndefined()
    expect(registry.lobbies).toEqual([])
    expect(registry.games).toEqual([gameContext])
    for (const userId of ['owner', 'second']) {
      expect(registry.getCurrentGame(userId)).toBe(gameContext)
      expect(registry.getActiveMembership(userId)).toEqual({ kind: 'game', gameId: 'game-1' })
    }

    registry.removeGame('game-1')
    expect(registry.games).toEqual([])
    expect(registry.getCurrentGame('owner')).toBeUndefined()
  })
})
