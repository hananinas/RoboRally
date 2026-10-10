import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import type { Board } from '@/game/Board'
import { instructions } from '@robo-rally/game-events'
import { Card } from '@/game/Card'
import type { PlayerId, RobotId } from '@/game/ids'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { Direction, opposite, type Position } from '@/game/spatial'

export type GamePhase = 'programming' | 'activation'

export type RobotActionResult = Readonly<{
  robotId: RobotId
  card: Card
  position: Position
  direction: Direction
}>

export type Antenna = Readonly<Position & { angle: number }>

export type NextActionResult = Readonly<{
  registerIndex: number
  action: RobotActionResult
}>

export type AddPlayerError = 'GAME_ALREADY_STARTED' | 'NO_SPAWN_AVAILABLE'

export class Game {
  readonly board: Board
  private readonly roster: Player[]
  readonly antenna: Antenna
  private readonly deck: readonly Card[]
  private currentPhase: GamePhase = 'programming'
  private registerIndex = 0
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()
  private started = false
  private isPaused = false

  constructor(
    board: Board,
    players: readonly Player[],
    deck: readonly Card[],
    antenna: Antenna = { x: Math.floor(board.width / 2), y: 0, angle: Math.PI / 2 },
  ) {
    if (deck.length < 5 || new Set(deck.map((card) => card.id)).size !== deck.length) {
      throw new RangeError('The deck must contain at least five distinct cards')
    }
    if (!board.contains(antenna) || !Number.isFinite(antenna.angle)) {
      throw new RangeError('The antenna must be on the board with a finite angle')
    }

    const playerIds = new Set<PlayerId>()
    const robotIds = new Set<RobotId>()
    for (const player of players) {
      if (playerIds.has(player.id) || robotIds.has(player.robot.id)) {
        throw new RangeError('Players and robots must have unique IDs')
      }
      board.positionOf(player.robot.id)
      playerIds.add(player.id)
      robotIds.add(player.robot.id)
    }

    this.board = board
    this.roster = [...players]
    this.antenna = Object.freeze({ ...antenna })
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
    return Object.freeze([...this.roster])
  }

  get hasStarted(): boolean {
    return this.started
  }

  get paused(): boolean {
    return this.isPaused
  }

  pause(): void {
    this.isPaused = true
  }

  resume(): void {
    this.isPaused = false
  }

  hasSubmittedProgram(playerId: PlayerId): boolean {
    return this.submittedPlayerIds.has(playerId)
  }

  addPlayer(): Result<Player, AddPlayerError> {
    if (this.started) return err('GAME_ALREADY_STARTED')
    const { width, height } = this.board
    const y = Math.floor(height / 2)
    let x = Math.floor(width / 2)
    while (x >= 0 && this.board.occupantAt({ x, y }) !== undefined) x--
    if (x < 0) return err('NO_SPAWN_AVAILABLE')

    const robot = new Robot(randomUUID(), Direction.NORTH)
    const hand = this.deck.map((card) => new Card(randomUUID(), card.instruction))
    const player = new Player(randomUUID(), robot, hand)
    this.board.placeRobot(robot.id, { x, y })
    this.roster.push(player)
    return ok(player)
  }

  removePlayer(playerId: PlayerId): void {
    const index = this.roster.findIndex((player) => player.id === playerId)
    if (index < 0) return
    const [player] = this.roster.splice(index, 1)
    this.board.removeRobot(player.robot.id)
    player.robot.clearProgram()
    this.submittedPlayerIds.delete(playerId)
    this.activatedRobotIds.delete(player.robot.id)
    if (this.currentPhase === 'activation') {
      if (this.roster.length === 0) {
        this.finishRound()
      } else if (this.activatedRobotIds.size === this.roster.length) {
        this.activateBoardElements()
        this.finishRegister()
      }
    }
    this.recheckProgrammingPhase()
  }

  submitProgram(playerId: PlayerId, program: readonly Card[]): void {
    if (this.isPaused) {
      throw new Error('Programs cannot be submitted while the game is paused')
    }
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
    if (
      this.currentPhase === 'programming' &&
      this.players.length > 0 &&
      this.players.every((player) => this.submittedPlayerIds.has(player.id))
    ) {
      this.startActivationPhase()
    }
  }

  executeNextAction(): NextActionResult {
    if (this.currentPhase !== 'activation') {
      throw new Error('Robot actions can only execute during activation')
    }

    const robot = this.nextRobotByPriority()
    if (!robot) throw new Error('No robots remain to activate')

    const registerIndex = this.registerIndex
    const card = robot.getProgramCard(registerIndex)
    this.executeCard(robot, card)
    this.activatedRobotIds.add(robot.id)
    const action: RobotActionResult = {
      robotId: robot.id,
      card,
      position: this.board.positionOf(robot.id),
      direction: robot.direction,
    }

    if (this.activatedRobotIds.size === this.players.length) {
      this.activateBoardElements()
      this.finishRegister()
    }
    return { registerIndex, action }
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

  private nextRobotByPriority(): Robot | undefined {
    let nextRobot: Robot | undefined
    let nearestDistance = Infinity
    let smallestOffset = Infinity
    const fullTurn = 2 * Math.PI
    const antennaAngle = this.antenna.angle % fullTurn

    // Radians start east and increase clockwise because board y increases south.
    // Recheck current positions every action; exact ties retain roster order.
    for (const { robot } of this.players) {
      if (this.activatedRobotIds.has(robot.id)) continue
      const position = this.board.positionOf(robot.id)
      const dx = position.x - this.antenna.x
      const dy = position.y - this.antenna.y
      const distance = Math.abs(dx) + Math.abs(dy)
      if (distance > nearestDistance) continue
      const angle = Math.atan2(dy, dx)
      const offset = ((angle - antennaAngle) % fullTurn + fullTurn) % fullTurn
      if (distance < nearestDistance || offset < smallestOffset) {
        nextRobot = robot
        nearestDistance = distance
        smallestOffset = offset
      }
    }
    return nextRobot
  }

  private executeCard(robot: Robot, card: Card): void {
    const effect = instructions[card.instruction]
    if (effect.kind === 'move') {
      const direction = effect.steps < 0 ? opposite(robot.direction) : robot.direction
      this.board.moveRobot(robot.id, direction, Math.abs(effect.steps))
    } else {
      robot.turn(effect.quarterTurns)
    }
  }

  private activateBoardElements(): void {
    // V0 has no board effects.
    // Ordered board effects run here after every robot has acted.
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
