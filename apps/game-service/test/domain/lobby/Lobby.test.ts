import { describe, expect, it } from 'vitest'
import type { User } from '@robo-rally/game-events'
import { Lobby } from '@/domain/lobby/Lobby'
import { boards } from '@/domain/game/BoardFactory'
import { DEFAULT_ROBOT_ID } from '@/domain/game/robotCatalog'

function user(userId: string): User {
  return { userId, username: userId }
}

describe('Lobby', () => {
  it('generates its own id, a default name derived from it, and keeps the given map', () => {
    const lobby = new Lobby(undefined, 'test-map', user('owner'), 'connection-1')
    expect(lobby.name).toBe(`Lobby ${lobby.lobbyId.slice(0, 8)}`)
    expect(lobby.mapName).toBe('test-map')
  })

  it('uses the given name when one is provided', () => {
    const lobby = new Lobby('Friday Night', 'test-map', user('owner'), 'connection-1')
    expect(lobby.name).toBe('Friday Night')
  })

  it('seeds the owner as the sole initial member', () => {
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    expect(lobby.size).toBe(1)
    expect(lobby.ownerUserId).toBe('owner')
    expect(lobby.getMember('owner')).toEqual({
      user: user('owner'), connectionId: 'connection-1', robotSpriteId: DEFAULT_ROBOT_ID,
    })
    expect(lobby.getMember('nobody')).toBeUndefined()
  })

  it('tracks members as they join and leave', () => {
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    lobby.addMember(user('second'), 'connection-2')
    expect(lobby.size).toBe(2)
    expect(lobby.members).toEqual([
      { user: user('owner'), connectionId: 'connection-1', robotSpriteId: DEFAULT_ROBOT_ID },
      { user: user('second'), connectionId: 'connection-2', robotSpriteId: DEFAULT_ROBOT_ID },
    ])

    lobby.removeMember('second')
    expect(lobby.size).toBe(1)
    expect(lobby.getMember('second')).toBeUndefined()
  })

  it('transfers ownership to the next-earliest member when the owner leaves', () => {
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    lobby.addMember(user('second'), 'connection-2')
    lobby.removeMember('owner')
    expect(lobby.ownerUserId).toBe('second')
  })

  it('caps players at the number of start tiles on its map', () => {
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    expect(lobby.maxPlayers).toBe(boards['test-map'].startTiles.length)
  })

  it('reports full only once membership reaches the player cap', () => {
    const lobby = new Lobby('Lobby', 'test-map', user('owner'), 'connection-1')
    for (let i = 1; i < lobby.maxPlayers - 1; i++) lobby.addMember(user(`player-${i}`), `connection-${i}`)
    expect(lobby.isFull).toBe(false)

    lobby.addMember(user('last'), 'connection-last')
    expect(lobby.size).toBe(lobby.maxPlayers)
    expect(lobby.isFull).toBe(true)
  })
})
