import { err, ok, type Result } from 'neverthrow'
import type { PlayerId, RobotId } from '@/domain/game/ids'
import type { Player } from '@/domain/game/Player'

export type RosterError = 'PLAYER_NOT_IN_GAME'

export class Roster {
  readonly #players: Player[] = []
  readonly #byPlayerId = new Map<PlayerId, Player>()
  readonly #byRobotId = new Map<RobotId, Player>()

  constructor(players: readonly Player[]) {
    for (const player of players) this.add(player)
  }

  get players(): readonly Player[] {
    return this.#players
  }

  get size(): number {
    return this.#players.length
  }

  add(player: Player): void {
    if (this.#byPlayerId.has(player.id) || this.#byRobotId.has(player.robot.id)) {
      throw new RangeError('Players and robots must have unique IDs')
    }
    this.#players.push(player)
    this.#byPlayerId.set(player.id, player)
    this.#byRobotId.set(player.robot.id, player)
  }

  remove(playerId: PlayerId): Result<Player, RosterError> {
    const player = this.#byPlayerId.get(playerId)
    if (player === undefined) return err('PLAYER_NOT_IN_GAME')
    this.#players.splice(this.#players.indexOf(player), 1)
    this.#byPlayerId.delete(player.id)
    this.#byRobotId.delete(player.robot.id)
    return ok(player)
  }

  getPlayer(playerId: PlayerId): Result<Player, RosterError> {
    const player = this.#byPlayerId.get(playerId)
    return player === undefined ? err('PLAYER_NOT_IN_GAME') : ok(player)
  }

  requirePlayer(playerId: PlayerId): Player {
    const player = this.#byPlayerId.get(playerId)
    if (player === undefined) {
      throw new Error(`Player ${playerId} is not in the game`)
    }
    return player
  }

  requireOwner(robotId: RobotId): Player {
    const player = this.#byRobotId.get(robotId)
    if (player === undefined) {
      throw new Error(`Robot ${robotId} is not in the game`)
    }
    return player
  }
}
