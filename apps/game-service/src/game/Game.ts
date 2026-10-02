import type { Board } from './Board.js'
import {Move1,
        Move2,
        Move3,
        TurnLeft, 
        TurnRight, 
        UTurn,
        BackUp,
        type Card } from './Card.js'
import type { PlayerId, RobotId } from './ids.js'
import type { Player } from './Player.js'
import type { Robot } from './Robot.js'
import { opposite, type Direction, type Position } from './spatial.js'

export type GamePhase = 'programming' | 'activation'

export type RobotActionResult = Readonly<{
  robotId: RobotId
  card: Card
  position: Position
  direction: Direction
}>

export type RegisterResult = Readonly<{
  registerIndex: number
  phase: GamePhase
  actions: readonly RobotActionResult[]
}>

export class Game {
  readonly board: Board
  private readonly roster: Player[]
  private readonly deck: readonly Card[]
  private currentPhase: GamePhase = 'programming'
  private registerIndex = 0
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()
  private started = false

  constructor(board: Board, players: readonly Player[], deck: readonly Card[]) {
    if (new Set(players.map((player) => player.id)).size !== players.length ||
        new Set(players.map((player) => player.robot.id)).size !== players.length) {
      throw new RangeError('Players and robots must have unique IDs')
    }
    if (deck.length < 5 || new Set(deck.map((card) => card.id)).size !== deck.length) {
      throw new RangeError('The deck must contain at least five distinct cards')
    }

    this.board = board
    this.roster = [...players]
    this.deck = [...deck]
    this.dealCards()
  }

  get phase(): GamePhase {
    return this.currentPhase
  }

  get currentRegister(): number {
    return this.registerIndex
  }

  get players(): readonly Player[] {
    return [...this.roster]
  }

  get hasStarted(): boolean {
    return this.started
  }

  hasSubmittedProgram(playerId: PlayerId): boolean {
    return this.submittedPlayerIds.has(playerId)
  }

  addPlayer(player: Player): boolean {
    if (this.started) throw new Error('Game has already started')
    if (this.roster.some((member) => member.id === player.id || member.robot.id === player.robot.id)) {
      throw new Error('Player or robot is already in the game')
    }
    const { width, height } = this.board
    const y = Math.floor(height / 2)
    let x = Math.floor(width / 2)
    while (x >= 0 && this.board.occupantAt({ x, y }) !== undefined) x--
    if (x < 0) return false
    this.board.placeRobot(player.robot.id, { x, y })
    if (player.hand.length === 0) player.setHand(this.deck)
    this.roster.push(player)
    return true
  }

  removePlayer(playerId: PlayerId): void {
    const index = this.roster.findIndex((player) => player.id === playerId)
    if (index < 0) return
    const [player] = this.roster.splice(index, 1)
    this.board.removeRobot(player.robot.id)
    player.robot.clearProgram()
    this.submittedPlayerIds.delete(playerId)
    this.activatedRobotIds.delete(player.robot.id)
    this.recheckProgrammingPhase()
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
    this.started = true
    this.submittedPlayerIds.add(playerId)
    this.recheckProgrammingPhase()
  }

  recheckProgrammingPhase(): void {
    if (this.currentPhase === 'programming' && this.roster.length > 0 &&
        this.submittedPlayerIds.size === this.roster.length) {
      this.startActivationPhase()
    }
  }

  executeCurrentRegister(): RegisterResult {
    if (this.currentPhase !== 'activation') {
      throw new Error('Registers can only execute during activation')
    }

    const executedRegister = this.registerIndex
    const actions: RobotActionResult[] = []
    let robotId = this.nextRobotByPriority()
    while (robotId !== undefined) {
      const robot = this.robotById(robotId)
      const card = robot.getProgramCard(executedRegister)
      this.executeCard(robotId, card)
      this.activatedRobotIds.add(robotId)
      actions.push({
        robotId,
        card,
        position: this.board.positionOf(robotId),
        direction: robot.direction,
      })
      robotId = this.nextRobotByPriority()
    }

    this.activateBoardElements()
    this.finishRegister()
    return { registerIndex: executedRegister, phase: this.currentPhase, actions }
  }

  private dealCards(): void {
    // V0 uses the supplied deck as a fixed hand, without drawing or shuffling.
    for (const player of this.players) {
      if (player.hand.length === 0) player.setHand(this.deck)
    }
  }

  private startActivationPhase(): void {
    this.currentPhase = 'activation'
    this.registerIndex = 0
    this.activatedRobotIds.clear()
  }

  private nextRobotByPriority(): RobotId | undefined {
    // V0 has one robot, so antenna priority cannot affect the order yet.
    return this.players.find((player) => !this.activatedRobotIds.has(player.robot.id))?.robot.id
  }

  private robotById(robotId: RobotId): Robot {
    const robot = this.players.find((player) => player.robot.id === robotId)?.robot
    if (!robot) throw new Error(`Robot ${robotId} is not in this game`)
    return robot
  }

  private executeCard(robotId: RobotId, card: Card): void {
    const robot = this.robotById(robotId)
    // This will probably inflate far too much in the future.
    // We should find a cleaner solution here
      if (card instanceof Move1) {
      this.board.moveRobot(robotId, robot.direction, 1)
    } else if (card instanceof Move2) {
      this.board.moveRobot(robotId, robot.direction, 2)
    } else if (card instanceof Move3) {
      this.board.moveRobot(robotId, robot.direction, 3)
    } else if (card instanceof BackUp) {
      // Moves one space backwards; the robot keeps facing the same way.
      this.board.moveRobot(robotId, opposite(robot.direction), 1)
    } else if (card instanceof TurnLeft) {
      robot.turnLeft()
    } else if (card instanceof TurnRight) {
      robot.turnRight()
    } else if (card instanceof UTurn) {
      robot.uTurn()
    } else {
      throw new Error(`Unsupported card ${card.id}`)
    }
  }

  private activateBoardElements(): void {
    // V0 has no board effects.
    // Either end with lazers here or add a dedicated step after this in executeCurrentRegister()
  }

  private finishRegister(): void {
    this.activatedRobotIds.clear()
    this.registerIndex++
    if (this.registerIndex === 5) this.finishRound()
  }

  private finishRound(): void {
    for (const player of this.players) player.robot.clearProgram()
    this.submittedPlayerIds.clear()
    this.registerIndex = 0
    this.dealCards()
    this.currentPhase = 'programming'
  }
}
