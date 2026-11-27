import { err, ok, type Result } from 'neverthrow'
import type { User } from '@robo-rally/game-events'

/** An occupant and the connection currently bound to its seat. `null` means none is bound. */
export type Seated<T> = T & { connectionId: string | null }

export type Bound<T> = {
  seat: Seated<T>
  /** Whether the seat had no connection bound, so the occupant is returning rather than repeating. */
  reconnected: boolean
}

/**
 * The seats of a lobby or a game, keyed by user.
 *
 * A seat belongs to one user for as long as it exists; what changes is which of that user's
 * connections is bound to it. Binding is refused while another of their connections holds the seat,
 * so a second tab cannot take over a live session, while a reload — whose previous connection is
 * already gone — can.
 *
 * Everything a session does around that, pausing a game, arming a reconnect timer, broadcasting a
 * roster, belongs to the session rather than here.
 */
export class Seats<T extends { user: User }> {
  private readonly byUserId = new Map<string, Seated<T>>()

  get size(): number {
    return this.byUserId.size
  }

  /** Read-only, so a caller cannot rebind a seat behind `bind`'s back. */
  values(): readonly Readonly<Seated<T>>[] {
    return [...this.byUserId.values()]
  }

  /**
   * The seat, whether or not a connection is bound to it. Needed where the seat is wanted without
   * a connection to match against; prefer `activeSeat` or `boundElsewhere` elsewhere.
   */
  get(userId: string): Seated<T> | undefined {
    return this.byUserId.get(userId)
  }

  /** The seat, but only when this connection is the one bound to it. */
  activeSeat(userId: string, connectionId: string): Result<Seated<T>, 'NOT_A_MEMBER'> {
    const seat = this.byUserId.get(userId)
    return seat?.connectionId === connectionId ? ok(seat) : err('NOT_A_MEMBER')
  }

  /** Whether a different connection of this user currently holds the seat. */
  boundElsewhere(userId: string, connectionId: string): boolean {
    const bound = this.byUserId.get(userId)?.connectionId
    return bound !== undefined && bound !== null && bound !== connectionId
  }

  add(seat: Seated<T>): void {
    this.byUserId.set(seat.user.userId, seat)
  }

  remove(userId: string): void {
    this.byUserId.delete(userId)
  }

  anyUnbound(): boolean {
    return this.values().some((seat) => seat.connectionId === null)
  }

  /** Detaches the current connection, keeping the seat. Reports whether one was bound. */
  unbind(userId: string): boolean {
    const seat = this.byUserId.get(userId)
    if (!seat || seat.connectionId === null) return false
    seat.connectionId = null
    return true
  }

  /** Binds a connection, refusing while another of the user's connections holds the seat. */
  bind(userId: string, connectionId: string): Result<Bound<T>, 'ALREADY_HAS_MEMBERSHIP' | 'INTERNAL_ERROR'> {
    const seat = this.byUserId.get(userId)
    if (!seat) return err('INTERNAL_ERROR')
    if (seat.connectionId !== null && seat.connectionId !== connectionId) return err('ALREADY_HAS_MEMBERSHIP')
    const reconnected = seat.connectionId === null
    seat.connectionId = connectionId
    return ok({ seat, reconnected })
  }
}
