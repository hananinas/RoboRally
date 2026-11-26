import { err, ok, type Result } from 'neverthrow'
import type { PlayerId, RobotId } from '@/domain/game/ids'
import type { Player } from '@/domain/game/Player'

export type RosterError = 'PLAYER_NOT_IN_GAME'

export class Roster {
  readonly #players: Player[] = []

  constructor(players: readonly Player[]) {
    for (const player of players) this.add(player)
  }

  get players(): readonly Player[] {
    return this.#players
  }

  add(player: Player): void {
    if (this.#players.some((other) => other.id === player.id || other.robot.id === player.robot.id)) {
      throw new RangeError('Players and robots must have unique IDs')
    }
    this.#players.push(player)
  }

  remove(playerId: PlayerId): Result<Player, RosterError> {
    const index = this.#players.findIndex((player) => player.id === playerId)
    if (index < 0) return err('PLAYER_NOT_IN_GAME')
    const [removed] = this.#players.splice(index, 1)
    return ok(removed)
  }

  getPlayer(playerId: PlayerId): Result<Player, RosterError> {
    const player = this.#findPlayer(playerId)
    return player === undefined ? err('PLAYER_NOT_IN_GAME') : ok(player)
  }

  requirePlayer(playerId: PlayerId): Player {
    const player = this.#findPlayer(playerId)
    if (player === undefined) {
      throw new Error(`Player ${playerId} is not in the game`)
    }
    return player
  }

  requireOwner(robotId: RobotId): Player {
    const player = this.#players.find((candidate) => candidate.robot.id === robotId)
    if (player === undefined) {
      throw new Error(`Robot ${robotId} is not in the game`)
    }
    return player
  }

  #findPlayer(playerId: PlayerId): Player | undefined {
    return this.#players.find((candidate) => candidate.id === playerId)
  }
}
