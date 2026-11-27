import { randomUUID } from 'node:crypto'
import type { RobotSpriteId, User } from '@robo-rally/game-events'
import { boards } from '@/domain/game/BoardFactory'
import type { BoardMapName } from '@/domain/game/boardMaps'
import { DEFAULT_ROBOT_ID } from '@/domain/game/robotCatalog'

export type LobbyMember = { user: User; connectionId: string; robotSpriteId: RobotSpriteId; colorHex?: string }

export class Lobby {
  readonly lobbyId: string
  readonly name: string
  readonly mapName: BoardMapName
  private readonly membersById = new Map<string, LobbyMember>()

  constructor(name: string | undefined, mapName: BoardMapName, owner: User, connectionId: string) {
    this.lobbyId = randomUUID()
    this.name = name ?? `Lobby ${this.lobbyId.slice(0, 8)}`
    this.mapName = mapName
    this.membersById.set(owner.userId, { user: owner, connectionId, robotSpriteId: DEFAULT_ROBOT_ID })
  }

  get size(): number {
    return this.membersById.size
  }

  get ownerUserId(): string {
    return this.membersById.keys().next().value!
  }

  get maxPlayers(): number {
    return boards[this.mapName].startTiles.length
  }

  get isFull(): boolean {
    return this.membersById.size >= this.maxPlayers
  }

  get members(): LobbyMember[] {
    return [...this.membersById.values()]
  }

  getMember(userId: string): LobbyMember | undefined {
    return this.membersById.get(userId)
  }

  addMember(user: User, connectionId: string): void {
    this.membersById.set(user.userId, { user, connectionId, robotSpriteId: DEFAULT_ROBOT_ID })
  }

  selectRobot(userId: string, robotSpriteId: RobotSpriteId): void {
    const member = this.membersById.get(userId)
    if (member) member.robotSpriteId = robotSpriteId
  }

  selectColor(userId: string, colorHex: string, palette: readonly string[]): 'OK' | 'TAKEN' {
    const member = this.membersById.get(userId)
    if (!member) return 'TAKEN'

    if (!palette.includes(colorHex)) return 'TAKEN'

    const isColorTaken = [...this.membersById.values()].some(
      (m) => m.user.userId !== userId && m.colorHex === colorHex
    )
    if (isColorTaken) return 'TAKEN'

    member.colorHex = colorHex
    return 'OK'
  }

  removeMember(userId: string): void {
    this.membersById.delete(userId)
  }
}
