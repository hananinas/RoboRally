import type { GameInitialization, PublicGameState, User, Winner } from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'
import type { AddPlayerError, BoardMapName, Game, Player, PlayerId } from '@/domain/game/index'
import type { LobbyMember } from '@/domain/lobby/Lobby'
import type { GameRepository } from '@/infra/GameRepository'
import {
  presentInitialization, presentPlayerConnectionChanged, presentProgrammingTimer, presentPublicGameState, presentWinner,
} from '@/socket/presenters/gamePresenter'
import { createActionScheduler, type ActionScheduler } from '@/socket/gameSession/actionScheduler'
import { createGameRecorder, type GameRecorder } from '@/socket/gameSession/gameRecorder'
import { createProgrammingTimer, type ProgrammingTimer, type ProgrammingTimerState } from '@/programmingTimer'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { logError } from '@/logger'

export type Seat = {
  user: User
  player: Player
  connectionId: string | null
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
  readonly actionScheduler: ActionScheduler
  readonly programmingTimer: ProgrammingTimer
  private readonly recorder: GameRecorder
  private declaredWinner: Winner | null = null

  constructor(io: GameSocketServer, game: Game, repository: GameRepository, mapName: BoardMapName) {
    this.io = io
    this.game = game
    this.publicRoom = `game:${game.id}:public`

    this.recorder = createGameRecorder({
      repository, game, mapName, seats: () => this.seats.values(),
    })
    this.actionScheduler = createActionScheduler({
      io, game, publicRoom: this.publicRoom,
      playerRoom: (playerId) => this.playerRoom(playerId),
      onWinnerDeclared: (playerId) => this.announceWinner(playerId),
      onRoundConcluded: () => this.recorder.saveState(),
      onAborted: () => this.recorder.saveAborted(),
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
      this.io.to(this.publicRoom).emit('game.aborted', { gameId: this.game.id })
      this.recorder.saveAborted()
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

  // Recorded when the win is declared: the winner may leave before anyone asks.
  private announceWinner(playerId: PlayerId): void {
    const seat = [...this.seats.values()].find(({ player }) => player.id === playerId)
    this.declaredWinner = presentWinner(playerId, seat?.user.username ?? '')
    this.io.to(this.publicRoom).emit('game.won', { gameId: this.game.id, ...this.declaredWinner })
    this.recorder.saveFinished(playerId)
  }

  publicState(): PublicGameState {
    return presentPublicGameState(this.game, this.programmingTimer.state(), this.seats.values(), this.declaredWinner)
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
      announceResumed()
      this.notifyReconnected(seat.player)
    }
  }

  markDisconnected(socket: GameSocket): void {
    const result = this.isMember(socket)
    if (result.isErr()) return
    const seat = result.value

    seat.connectionId = null
    this.game.pause()
    this.io.to(this.publicRoom).emit('game.playerConnectionChanged', presentPlayerConnectionChanged(this.game, seat.player, false))
  }

  addSeats(members: readonly LobbyMember[]): Result<void, AddPlayerError> {
    for (const { user, connectionId, robotSpriteId } of members) {
      const seated = this.game.addPlayer(robotSpriteId)
      if (seated.isErr()) return err(seated.error)
      this.seats.set(user.userId, { user, player: seated.value, connectionId })
    }
    this.recorder.saveState()
    return ok(undefined)
  }

  leave(socket: GameSocket): Result<void, 'NOT_A_MEMBER'> {
    return this.isMember(socket).map(({ player, user }) => {
      const progress = this.game.removePlayer(player.id)
      this.seats.delete(user.userId)
      void socket.leave(this.publicRoom)
      void socket.leave(this.playerRoom(player.id))
      this.io.to(this.publicRoom).emit('game.playerLeft', {
        gameId: this.game.id, playerId: player.id, robotId: player.robot.id,
      })
      this.closeTimerIfRoundConcluded()
      this.actionScheduler.announceProgress(progress)
      this.actionScheduler.scheduleNextAction()
      this.recorder.markPlayerLeft(player.id)
      if (this.seats.size === 0) this.recorder.saveAborted()
    })
  }

  reattach(socket: GameSocket): Result<ReattachedMembership, 'ALREADY_HAS_MEMBERSHIP' | 'INTERNAL_ERROR'> {
    const seat = this.seatFor(socket)
    if (!seat) return err('INTERNAL_ERROR')
    if (seat.connectionId && seat.connectionId !== socket.id) return err('ALREADY_HAS_MEMBERSHIP')

    const previousRooms = new Set(socket.rooms)
    const previousConnectionId = seat.connectionId
    const wasPaused = this.game.paused
    const reconnected = this.reattachSeat(seat, socket.id)
    try {
      void socket.join([this.publicRoom, this.playerRoom(seat.player.id)])
      const announceResumed = this.resumeUnlessStillDisconnected()
      const initialization = presentInitialization(this.game, seat.player, this.publicState())
      return ok({
        initialization,
        announceReconnected: () => {
          announceResumed()
          if (reconnected) this.notifyReconnected(seat.player)
        },
      })
    } catch (error) {
      for (const room of [this.publicRoom, this.playerRoom(seat.player.id)]) {
        if (!previousRooms.has(room)) void socket.leave(room)
      }
      logError('Failed to reattach game membership', error, { command: 'membership.get', gameId: this.game.id })
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
