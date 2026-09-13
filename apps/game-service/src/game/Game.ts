import type { Board } from './Board.js'
import type { Card } from './Card.js'
import type { PlayerId, RobotId } from './ids.js'
import type { Player } from './Player.js'

export type GamePhase = 'programming' | 'activation'

export class Game {
  readonly board: Board
  readonly players: readonly Player[]
  private readonly deck: readonly Card[]
  private currentPhase: GamePhase = 'programming'
  private registerIndex = 0
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()

  constructor(board: Board, players: readonly Player[], deck: readonly Card[]) {
    // V0 starts with one player; multi-robot coordination comes later.
    if (players.length !== 1) {
      throw new RangeError('V0 requires exactly one player')
    }
    if (deck.length < 5 || new Set(deck.map((card) => card.id)).size !== deck.length) {
      throw new RangeError('The deck must contain at least five distinct cards')
    }

    this.board = board
    this.players = [...players]
    this.deck = [...deck]
    this.dealCards()
  }

  get phase(): GamePhase {
    return this.currentPhase
  }

  get currentRegister(): number {
    return this.registerIndex
  }

  submitProgram(playerId: PlayerId, program: readonly Card[]): void {
    if (this.currentPhase !== 'programming') {
      throw new Error('Programs can only be submitted during programming')
    }

    const player = this.players.find((candidate) => candidate.id === playerId)
    if (!player) {
      throw new Error(`Player ${playerId} is not in this game`)
    }
    if (this.submittedPlayerIds.has(playerId)) {
      throw new Error(`Player ${playerId} has already submitted a program`)
    }
    if (program.length !== 5 || new Set(program.map((card) => card.id)).size !== 5) {
      throw new RangeError('A program must contain five distinct cards')
    }

    const hand = new Map(player.hand.map((card) => [card.id, card]))
    if (program.some((card) => hand.get(card.id) !== card)) {
      throw new Error('Every program card must come from the player hand')
    }

    player.robot.setProgram(program)
    this.submittedPlayerIds.add(playerId)
    if (this.submittedPlayerIds.size === this.players.length) {
      this.startActivationPhase()
    }
  }

  private dealCards(): void {
    // V0 uses the supplied deck as a fixed hand, without drawing or shuffling.
    this.players[0].setHand(this.deck)
  }

  private startActivationPhase(): void {
    this.currentPhase = 'activation'
    this.registerIndex = 0
    this.activatedRobotIds.clear()
  }
}
