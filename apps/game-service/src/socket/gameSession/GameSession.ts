import { randomUUID } from 'node:crypto'
import type { GameInitialization, PublicGameState, RobotSpriteId, User, VoteProposal, Winner } from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'
import type { AddPlayerError, Game, Player } from '@/domain/game/index'
import {
  presentInitialization, presentPlayerConnectionChanged, presentProgrammingTimer, presentPublicGameState, presentWinner,
} from '@/socket/presenters/gamePresenter'
import { createActionScheduler, type ActionScheduler } from '@/socket/gameSession/actionScheduler'
import { createProgrammingTimer, type ProgrammingTimer, type ProgrammingTimerState } from '@/programmingTimer'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { logError } from '@/logger'

export type Seat = {
  user: User
  player: Player
  connectionId: string | null
}

type MembershipChange = { removedUserIds: string[]; announce: () => void }

type Ballot = {
  proposalId: string
  action: VoteProposal['action']
  votesRequired: number
  voters: Set<string>
}

export type ReattachedMembership = {
  initialization: GameInitialization
  announceReconnected: () => void
}

export class GameSession {
  readonly io: GameSocketServer
  readonly game: Game
  readonly publicRoom: string
  private readonly seats = new Map<string, Seat>()
  private ballots: Ballot[] = []
  readonly actionScheduler: ActionScheduler
  readonly programmingTimer: ProgrammingTimer
  private recordedWinner: Winner | null = null
  private winnerAnnounced = false

  constructor(io: GameSocketServer, game: Game) {
    this.io = io
    this.game = game
    this.publicRoom = `game:${game.id}:public`

    this.actionScheduler = createActionScheduler({
      io, game, publicRoom: this.publicRoom,
      playerRoom: (playerId) => this.playerRoom(playerId),
      announceWinnerIfConcluded: () => this.announceWinnerIfConcluded(),
      onProgrammingStarted: () => this.programmingTimer.reset(),
      onStop: () => this.programmingTimer.stop(),
    })
    this.programmingTimer = createProgrammingTimer({
      onExpire: () => this.onProgrammingExpired(),
      onChange: (timer) => this.onProgrammingTimerChanged(timer),
    })
  }

  private onProgrammingExpired(): void {
    if (this.game.aborted || this.game.winner !== undefined || this.seats.size === 0) {
      this.programmingTimer.stop()
      return
    }
    try {
      const completed = this.game.completePrograms()
      if (completed.isErr()) throw new Error(`Cannot complete programs: ${completed.error}`)
      for (const program of completed.value) {
        publishProgramFinalized(this, program, 'TIMEOUT')
      }
    } catch (error) {
      logError('Failed to complete programs at the deadline', error, { gameId: this.game.id, source: 'programmingTimer' })
      this.actionScheduler.stop()
      this.game.abort()
      this.ballots = []
      this.io.to(this.publicRoom).emit('game.aborted', { gameId: this.game.id })
    }
  }

  private onProgrammingTimerChanged(timer: ProgrammingTimerState): void {
    this.io.to(this.publicRoom).emit('program.timerChanged', presentProgrammingTimer(this.game.id, timer))
    if (timer.status !== 'CLOSED' || this.game.requirePhase('activation').isErr()) return
    this.actionScheduler.scheduleNextAction()
  }

  playerRoom(playerId: string): string {
    return `game:${this.game.id}:player:${playerId}`
  }

  winner(): Winner | null {
    if (this.recordedWinner === null && this.game.winner !== undefined) {
      const seat = [...this.seats.values()].find(({ player }) => player.id === this.game.winner)
      this.recordedWinner = presentWinner(this.game.winner, seat?.user.username ?? '')
    }
    return this.recordedWinner
  }

  private announceWinnerIfConcluded(): void {
    if (this.winnerAnnounced || this.game.winner === undefined) return
    this.winnerAnnounced = true
    this.io.to(this.publicRoom).emit('game.won', { gameId: this.game.id, ...this.winner()! })
  }

  publicState(): PublicGameState {
    return presentPublicGameState(this.game, this.programmingTimer.state(), this.seats.values(), this.winner(), this.voteSummaries())
  }

  private voteSummaries(): VoteProposal[] {
    return this.ballots.map(({ proposalId, action, votesRequired, voters }) => ({
      proposalId, action, votesRequired, votesCast: voters.size,
    }))
  }

  private publishVotes(): void {
    this.io.to(this.publicRoom).emit('game.votesChanged', { gameId: this.game.id, proposals: this.voteSummaries() })
  }

  private updateDisconnectVotes(leaving?: Seat): { shouldPublishVotes: boolean; kicks: Seat[] } {
    const remaining = [...this.seats.values()].filter((seat) => seat !== leaving)
    const eligible = new Set(remaining.filter((seat) => seat.connectionId !== null).map(({ player }) => player.id))
    const votesRequired = Math.ceil(2 * eligible.size / 3)
    const open: Ballot[] = []
    const kicks: Seat[] = []

    if (this.game.paused && votesRequired > 0) {
      for (const seat of remaining) {
        if (seat.connectionId !== null) continue
        const previous = this.ballots.find(({ action }) => action.targetPlayerId === seat.player.id)
        const voters = new Set(Array.from(previous?.voters ?? []).filter((id) => eligible.has(id)))
        if (voters.size >= votesRequired) {
          kicks.push(seat)
        } else {
          open.push({
            proposalId: previous?.proposalId ?? randomUUID(),
            action: { kind: 'KICK_DISCONNECTED_PLAYER', targetPlayerId: seat.player.id },
            votesRequired, voters,
          })
        }
      }
    }
    const shouldPublishVotes = this.ballots.length > 0 || open.length > 0
    this.ballots = open
    return { shouldPublishVotes, kicks }
  }

  castVote(player: Player, proposalId: string): Result<MembershipChange | null, 'PROPOSAL_CLOSED'> {
    const ballot = this.ballots.find((candidate) => candidate.proposalId === proposalId)
    if (!this.game.paused || !ballot) return err('PROPOSAL_CLOSED')
    const target = [...this.seats.values()].find((seat) => seat.player.id === ballot.action.targetPlayerId)
    if (!target || target.connectionId !== null) return err('PROPOSAL_CLOSED')
    if (ballot.voters.has(player.id)) return ok(null)

    ballot.voters.add(player.id)
    if (ballot.voters.size < ballot.votesRequired) {
      this.publishVotes()
      return ok(null)
    }

    this.ballots = this.ballots.filter((other) => other !== ballot)
    return ok(this.removeSeats([target], true))
  }

  isMember(socket: GameSocket): Result<Seat, 'NOT_A_MEMBER'> {
    const seat = this.seatFor(socket)
    return seat?.connectionId === socket.id ? ok(seat) : err('NOT_A_MEMBER')
  }

  expireProgrammingIfDue(): Result<void, 'WRONG_PHASE'> {
    if (this.game.aborted || this.game.winner !== undefined || this.game.paused) return ok(undefined)

    const expired = this.programmingTimer.expireIfDue()
    // Let the game operation report GAME_ABORTED if automatic completion failed.
    if (this.game.aborted) return ok(undefined)

    return expired ? err('WRONG_PHASE') : ok(undefined)
  }

  noteProgramSubmitted(): void {
    if (!this.closeTimerIfRoundConcluded()) this.programmingTimer.start()
  }

  private closeTimerIfRoundConcluded(): boolean {
    const concluded = this.game.requirePhase('activation').isOk()
    if (concluded) this.programmingTimer.close()
    return concluded
  }

  getSeat(userId: string): Seat | undefined {
    return this.seats.get(userId)
  }

  get seatCount(): number {
    return this.seats.size
  }

  reconnectIfRecovered(socket: GameSocket): void {
    if (!socket.recovered) return
    const seat = this.seatFor(socket)
    if (seat && this.reattachSeat(seat, socket.id)) {
      const announceResumed = this.resumeUnlessStillDisconnected()
      const { shouldPublishVotes } = this.updateDisconnectVotes()
      announceResumed()
      if (shouldPublishVotes) this.publishVotes()
      this.notifyReconnected(seat.player)
    }
  }

  markDisconnected(socket: GameSocket): MembershipChange | undefined {
    const result = this.isMember(socket)
    if (result.isErr()) return
    const seat = result.value

    seat.connectionId = null
    this.game.pause()
    const { shouldPublishVotes, kicks } = this.updateDisconnectVotes()
    const disconnected = presentPlayerConnectionChanged(this.game, seat.player, false)
    const departures = kicks.length > 0 ? this.removeSeats(kicks, shouldPublishVotes) : undefined
    return {
      removedUserIds: departures?.removedUserIds ?? [],
      announce: () => {
        try {
          this.io.to(this.publicRoom).emit('game.playerConnectionChanged', disconnected)
        } finally {
          if (departures) departures.announce()
          else if (shouldPublishVotes) this.publishVotes()
        }
      },
    }
  }

  addSeat(user: User, connectionId: string, robotSpriteId: RobotSpriteId): Result<Player, AddPlayerError> {
    return this.game.addPlayer(robotSpriteId).map((player) => {
      this.seats.set(user.userId, { user, player, connectionId })
      return player
    })
  }

  leave(socket: GameSocket): Result<MembershipChange, 'NOT_A_MEMBER'> {
    return this.isMember(socket).map((seat) => {
      void socket.leave(this.publicRoom)
      void socket.leave(this.playerRoom(seat.player.id))
      const { shouldPublishVotes, kicks } = this.updateDisconnectVotes(seat)
      return this.removeSeats([seat, ...kicks], shouldPublishVotes)
    })
  }

  private removeSeats(seats: Seat[], shouldPublishVotes: boolean): MembershipChange {
    let roundConcluded = false
    let announceResumed: (() => void) | undefined
    for (const { user, player, connectionId } of seats) {
      const removal = this.game.removePlayer(player.id)
      roundConcluded ||= removal.roundConcluded
      this.seats.delete(user.userId)
      if (connectionId === null) announceResumed = this.resumeUnlessStillDisconnected()
    }

    // The handler clears all removed memberships before publishing the departures.
    const announce = () => {
      try {
        for (const { player, connectionId } of seats) {
          this.io.to(this.publicRoom).emit('game.playerLeft', {
            gameId: this.game.id, playerId: player.id, robotId: player.robot.id,
            ...(connectionId === null && { paused: this.game.paused }),
          })
        }
        if (shouldPublishVotes) this.publishVotes()
      } finally {
        this.actionScheduler.scheduleNextAction()
        this.closeTimerIfRoundConcluded()
        if (announceResumed) announceResumed()
        else this.actionScheduler.announceProgress({ roundConcluded })
      }
    }
    return { removedUserIds: seats.map(({ user }) => user.userId), announce }
  }

  reattach(socket: GameSocket): Result<ReattachedMembership, 'ALREADY_HAS_MEMBERSHIP' | 'INTERNAL_ERROR'> {
    const seat = this.seatFor(socket)
    if (!seat) return err('INTERNAL_ERROR')
    if (seat.connectionId && seat.connectionId !== socket.id) return err('ALREADY_HAS_MEMBERSHIP')

    const previousRooms = new Set(socket.rooms)
    const previousConnectionId = seat.connectionId
    const previousBallots = this.ballots
    const wasPaused = this.game.paused
    const reconnected = this.reattachSeat(seat, socket.id)
    try {
      void socket.join([this.publicRoom, this.playerRoom(seat.player.id)])
      const announceResumed = this.resumeUnlessStillDisconnected()
      const shouldPublishVotes = reconnected && this.updateDisconnectVotes().shouldPublishVotes
      const initialization = presentInitialization(this.game, seat.player, this.publicState())
      return ok({
        initialization,
        announceReconnected: () => {
          announceResumed()
          if (shouldPublishVotes) this.publishVotes()
          if (reconnected) this.notifyReconnected(seat.player)
        },
      })
    } catch (error) {
      for (const room of [this.publicRoom, this.playerRoom(seat.player.id)]) {
        if (!previousRooms.has(room)) void socket.leave(room)
      }
      logError('Failed to reattach game membership', error, { command: 'membership.get', gameId: this.game.id })
      this.ballots = previousBallots
      seat.connectionId = previousConnectionId
      if (wasPaused) this.game.pause()
      return err('INTERNAL_ERROR')
    }
  }

  private seatFor(socket: GameSocket): Seat | undefined {
    return this.seats.get(socket.data.user.userId)
  }

  private reattachSeat(seat: Seat, socketId: string): boolean {
    const wasDisconnected = seat.connectionId === null
    seat.connectionId = socketId
    return wasDisconnected
  }

  private resumeUnlessStillDisconnected(): () => void {
    if (this.anyDisconnected()) return () => {}
    const result = this.game.resume()
    if (result.isErr()) return () => {}
    return () => this.actionScheduler.announceProgress(result.value)
  }

  private notifyReconnected(player: Player): void {
    this.io.to(this.publicRoom).emit('game.playerConnectionChanged', presentPlayerConnectionChanged(this.game, player, true))
    this.io.to(this.playerRoom(player.id)).emit('program.timerChanged', presentProgrammingTimer(this.game.id, this.programmingTimer.state()))
    this.actionScheduler.scheduleNextAction()
  }

  private anyDisconnected(): boolean {
    return [...this.seats.values()].some((seat) => seat.connectionId === null)
  }
}
