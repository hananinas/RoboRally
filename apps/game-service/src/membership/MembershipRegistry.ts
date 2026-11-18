import type { MembershipContext } from '@/socket/gameSession/gameMembership'
import { Lobby } from '@/membership/Lobby'

export type ActiveMembership = { kind: 'lobby'; lobbyId: string } | { kind: 'game'; gameId: string }

export class MembershipRegistry {
  private readonly gamesById = new Map<string, MembershipContext>()
  private readonly lobbiesById = new Map<string, Lobby>()
  private readonly activeMembershipsByUser = new Map<string, ActiveMembership>()

  get lobbies(): Lobby[] {
    return [...this.lobbiesById.values()]
  }

  get games(): MembershipContext[] {
    return [...this.gamesById.values()]
  }

  getCurrentGame(userId: string): MembershipContext | undefined {
    const membership = this.activeMembershipsByUser.get(userId)
    return membership?.kind === 'game' ? this.gamesById.get(membership.gameId) : undefined
  }

  getCurrentLobby(userId: string): Lobby | undefined {
    const membership = this.activeMembershipsByUser.get(userId)
    return membership?.kind === 'lobby' ? this.lobbiesById.get(membership.lobbyId) : undefined
  }

  getActiveMembership(userId: string): ActiveMembership | undefined {
    return this.activeMembershipsByUser.get(userId)
  }

  setActiveMembership(userId: string, membership: ActiveMembership): void {
    this.activeMembershipsByUser.set(userId, membership)
  }

  clearActiveMembership(userId: string): void {
    this.activeMembershipsByUser.delete(userId)
  }

  getLobby(lobbyId: string): Lobby | undefined {
    return this.lobbiesById.get(lobbyId)
  }

  addLobby(lobby: Lobby): void {
    this.lobbiesById.set(lobby.lobbyId, lobby)
  }

  removeLobby(lobbyId: string): void {
    this.lobbiesById.delete(lobbyId)
  }

  removeGame(gameId: string): void {
    this.gamesById.delete(gameId)
  }

  promoteLobbyToGame(lobby: Lobby, gameContext: MembershipContext, memberUserIds: Iterable<string>): void {
    this.gamesById.set(gameContext.game.id, gameContext)
    for (const userId of memberUserIds) {
      this.activeMembershipsByUser.set(userId, { kind: 'game', gameId: gameContext.game.id })
    }
    this.removeLobby(lobby.lobbyId)
  }
}
