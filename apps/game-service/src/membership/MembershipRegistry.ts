import type { GameSession } from '@/socket/gameSession/GameSession'
import type { LobbySession } from '@/socket/LobbySession'

export type ActiveMembership = { kind: 'lobby'; lobbyId: string } | { kind: 'game'; gameId: string }

export class MembershipRegistry {
  private readonly gamesById = new Map<string, GameSession>()
  private readonly lobbiesById = new Map<string, LobbySession>()
  private readonly activeMembershipsByUser = new Map<string, ActiveMembership>()

  get lobbies(): LobbySession[] {
    return [...this.lobbiesById.values()]
  }

  get games(): GameSession[] {
    return [...this.gamesById.values()]
  }

  getCurrentGame(userId: string): GameSession | undefined {
    const membership = this.activeMembershipsByUser.get(userId)
    return membership?.kind === 'game' ? this.gamesById.get(membership.gameId) : undefined
  }

  getCurrentLobby(userId: string): LobbySession | undefined {
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

  getLobby(lobbyId: string): LobbySession | undefined {
    return this.lobbiesById.get(lobbyId)
  }

  addLobby(lobbySession: LobbySession): void {
    this.lobbiesById.set(lobbySession.lobby.lobbyId, lobbySession)
  }

  removeLobby(lobbyId: string): void {
    this.lobbiesById.delete(lobbyId)
  }

  removeGame(gameId: string): void {
    this.gamesById.delete(gameId)
  }

  promoteLobbyToGame(lobbySession: LobbySession, gameSession: GameSession, memberUserIds: Iterable<string>): void {
    this.gamesById.set(gameSession.game.id, gameSession)
    for (const userId of memberUserIds) {
      this.activeMembershipsByUser.set(userId, { kind: 'game', gameId: gameSession.game.id })
    }
    this.removeLobby(lobbySession.lobby.lobbyId)
  }
}
