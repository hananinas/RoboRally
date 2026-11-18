import type { MembershipContext } from '@/socket/gameSession/gameMembership'
import type { Lobby } from '@/domain/lobby/Lobby'
import { LobbySession } from '@/socket/LobbySession'

export type ActiveMembership = { kind: 'lobby'; lobbyId: string } | { kind: 'game'; gameId: string }

export class MembershipRegistry {
  private readonly gamesById = new Map<string, MembershipContext>()
  private readonly lobbiesById = new Map<string, LobbySession>()
  private readonly activeMembershipsByUser = new Map<string, ActiveMembership>()

  get lobbies(): LobbySession[] {
    return [...this.lobbiesById.values()]
  }

  get games(): MembershipContext[] {
    return [...this.gamesById.values()]
  }

  getCurrentGame(userId: string): MembershipContext | undefined {
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

  addLobby(lobby: Lobby): LobbySession {
    const session = new LobbySession(lobby)
    this.lobbiesById.set(lobby.lobbyId, session)
    return session
  }

  removeLobby(lobbyId: string): void {
    this.lobbiesById.delete(lobbyId)
  }

  removeGame(gameId: string): void {
    this.gamesById.delete(gameId)
  }

  promoteLobbyToGame(lobbySession: LobbySession, gameContext: MembershipContext, memberUserIds: Iterable<string>): void {
    this.gamesById.set(gameContext.game.id, gameContext)
    for (const userId of memberUserIds) {
      this.activeMembershipsByUser.set(userId, { kind: 'game', gameId: gameContext.game.id })
    }
    this.removeLobby(lobbySession.lobby.lobbyId)
  }
}
