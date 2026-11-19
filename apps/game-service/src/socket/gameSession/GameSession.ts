import type { PublicGameState, Winner } from '@robo-rally/game-events'
import type { GameSocketServer } from '@/socket/gameServer'
import type { Game } from '@/domain/game/index'
import { presentProgrammingTimer, presentPublicGameState, presentWinner } from '@/socket/presenters/gamePresenter'
import { createActionScheduler, type ActionScheduler } from '@/socket/gameSession/actionScheduler'
import { createProgrammingTimer, type ProgrammingTimer } from '@/programmingTimer'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { logError } from '@/logger'
import type { GameMembership } from '@/socket/gameSession/gameMembership'

export class GameSession {
  readonly io: GameSocketServer
  readonly game: Game
  readonly publicRoom: string
  readonly memberships = new Map<string, GameMembership>()
  readonly actionScheduler: ActionScheduler
  readonly programmingTimer: ProgrammingTimer
  private recordedWinner: Winner | null = null

  constructor(io: GameSocketServer, game: Game) {
    this.io = io
    this.game = game
    this.publicRoom = `game:${game.id}:public`

    this.actionScheduler = createActionScheduler({
      io, game, publicRoom: this.publicRoom,
      playerRoom: (playerId) => this.playerRoom(playerId),
      winner: () => this.winner(),
      onProgrammingStarted: () => this.programmingTimer.reset(),
      onStop: () => this.programmingTimer.stop(),
    })
    this.programmingTimer = createProgrammingTimer({
      onExpire: () => {
        if (game.aborted || game.winner !== undefined || this.memberships.size === 0) {
          this.programmingTimer.stop()
          return
        }
        try {
          const completed = game.completePrograms()
          if (completed.isErr()) throw new Error(`Cannot complete programs: ${completed.error}`)
          for (const program of completed.value) {
            publishProgramFinalized(this, program, 'TIMEOUT')
          }
        } catch (error) {
          logError('Failed to complete programs at the deadline', error, { gameId: game.id, source: 'programmingTimer' })
          this.actionScheduler.stop()
          game.abort()
          io.to(this.publicRoom).emit('game.aborted', { gameId: game.id })
        }
      },
      onChange: (timer) => {
        io.to(this.publicRoom).emit('program.timerChanged', presentProgrammingTimer(game.id, timer))
        if (timer.status !== 'CLOSED' || game.requirePhase('activation').isErr()) return
        this.actionScheduler.scheduleNextAction()
      },
    })
  }

  playerRoom(playerId: string): string {
    return `game:${this.game.id}:player:${playerId}`
  }

  winner(): Winner | null {
    if (this.recordedWinner === null && this.game.winner !== undefined) {
      const membership = [...this.memberships.values()].find(({ player }) => player.id === this.game.winner)
      this.recordedWinner = presentWinner(this.game.winner, membership?.user.username ?? '')
    }
    return this.recordedWinner
  }

  publicState(): PublicGameState {
    return presentPublicGameState(this.game, this.programmingTimer.state(), this.memberships.values(), this.winner())
  }
}
