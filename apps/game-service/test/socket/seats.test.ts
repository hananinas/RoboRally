import { describe, expect, it } from 'vitest'
import type { User } from '@robo-rally/game-events'
import { Seats } from '@/socket/seats'

type Occupant = { user: User; label: string }

function user(userId: string): User {
  return { userId, username: userId }
}

function seatsFor(userId: string, connectionId: string | null): Seats<Occupant> {
  const seats = new Seats<Occupant>()
  seats.add({ user: user(userId), label: `${userId}-label`, connectionId })
  return seats
}

describe('Seats', () => {
  it('recognises an active seat only for the connection bound to it', () => {
    const seats = seatsFor('bence', 'connection-1')
    expect(seats.activeSeat('bence', 'connection-1')._unsafeUnwrap().label).toBe('bence-label')
    expect(seats.activeSeat('bence', 'connection-2')._unsafeUnwrapErr()).toBe('NOT_A_MEMBER')
    expect(seats.activeSeat('nobody', 'connection-1')._unsafeUnwrapErr()).toBe('NOT_A_MEMBER')
    expect(seatsFor('bence', null).activeSeat('bence', 'connection-1')._unsafeUnwrapErr()).toBe('NOT_A_MEMBER')
  })

  it('separates a seat held by another connection from one that is free', () => {
    const seats = seatsFor('bence', 'connection-1')
    expect(seats.boundElsewhere('bence', 'connection-2')).toBe(true)
    expect(seats.boundElsewhere('bence', 'connection-1')).toBe(false)
    expect(seats.boundElsewhere('nobody', 'connection-2')).toBe(false)
    expect(seatsFor('bence', null).boundElsewhere('bence', 'connection-2')).toBe(false)
  })

  it('binds a free seat and reports the occupant as returning', () => {
    const seats = seatsFor('bence', null)
    expect(seats.bind('bence', 'connection-2')._unsafeUnwrap().reconnected).toBe(true)
    expect(seats.activeSeat('bence', 'connection-2').isOk()).toBe(true)
    expect(seats.anyUnbound()).toBe(false)
  })

  it('reports no reconnection when the bound connection binds again', () => {
    const seats = seatsFor('bence', 'connection-1')
    expect(seats.bind('bence', 'connection-1')._unsafeUnwrap().reconnected).toBe(false)
    expect(seats.activeSeat('bence', 'connection-1').isOk()).toBe(true)
  })

  it('refuses a second connection and leaves the existing binding intact', () => {
    const seats = seatsFor('bence', 'connection-1')
    expect(seats.bind('bence', 'connection-2')._unsafeUnwrapErr()).toBe('ALREADY_HAS_MEMBERSHIP')
    expect(seats.activeSeat('bence', 'connection-1').isOk()).toBe(true)
  })

  it('refuses to bind a seat that has no occupant', () => {
    expect(new Seats<Occupant>().bind('nobody', 'connection-1')._unsafeUnwrapErr()).toBe('INTERNAL_ERROR')
  })

  it('keeps the seat and its occupant when unbinding, and unbinds only once', () => {
    const seats = seatsFor('bence', 'connection-1')
    expect(seats.unbind('bence')).toBe(true)
    expect(seats.unbind('bence')).toBe(false)
    expect(seats.get('bence')).toEqual({ user: user('bence'), label: 'bence-label', connectionId: null })
    expect(seats.anyUnbound()).toBe(true)
  })
})
