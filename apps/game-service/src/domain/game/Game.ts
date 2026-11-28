import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import type { Board } from '@/domain/game/Board'
import { effects, type Instruction, type ResolvedInstruction, type RobotSpriteId } from '@robo-rally/game-events'
import { captureEnvironmentSnapshot, environmentSteps, type EnvironmentChanges } from '@/domain/game/environment'
import { Card } from '@/domain/game/Card'
import { Deck } from '@/domain/game/Deck'
import type { CardId, GameId, PlayerId, RobotId } from '@/domain/game/ids'
import { Player } from '@/domain/game/Player'
import { REGISTER_COUNT, type RegisterView } from '@/domain/game/Registers'
import { Robot, ROBOT_COLOURS } from '@/domain/game/Robot'
import { RobotPlacements } from '@/domain/game/RobotPlacements'
import { Roster } from '@/domain/game/Roster'
import { Direction, opposite, type Position } from '@/domain/game/spatial'
import { PositiveInteger, UnsignedInteger } from '@/numbers'
import {
  GameLifecycle,
  type AbortError,
  type GamePhase,
  type PauseError,
  type PhaseError,
  type ResumeError,
} from '@/domain/game/GameLifecycle'

export type { GamePhase, PauseError, ResumeError, AbortError, PhaseError }

export type RobotActionResult = Readonly<{
  robotId: RobotId
  card: Card
  resolvedInstruction: ResolvedInstruction | undefined
  position: Position
  direction: Direction
}>

// One robot rebooting during an action. fellAt can be just outside the board.
export type RebootResult = Readonly<{
  robotId: RobotId
  fellAt: Position
  landedAt: Position
}>

export type NextActionResult = Readonly<{
  registerIndex: number
  action: RobotActionResult
  pushedRobots: readonly Readonly<{
    robotId: RobotId
    position: Position
    direction: Direction
  }>[]
  // Every reboot the action caused, in the order it happened.
  reboots: readonly RebootResult[]
  roundConcluded: boolean
}>

export type EnvironmentStepResult = EnvironmentChanges & Readonly<{
  roundConcluded: boolean
}> & (
  | Readonly<{ kind: 'CONVEYORS'; reboots: readonly RebootResult[] }>
  | Readonly<{ kind: 'GEARS' | 'CHECKPOINTS' }>
)

export type ActivationStep =
  | Readonly<{ type: 'robot'; result: NextActionResult }>
  | Readonly<{ type: 'environment'; result: EnvironmentStepResult }>

export type AddPlayerError = 'NO_SPAWN_AVAILABLE'

export type SubmitProgramError =
  | PhaseError
  | 'PLAYER_NOT_IN_GAME'
  | 'ALREADY_SUBMITTED'
  | 'INVALID_PROGRAM'

export type UpdateRegistersError = SubmitProgramError

export type CompletedProgram = Readonly<{
  playerId: PlayerId
  cards: readonly Card[]
}>


export type PlayerPlacement = Readonly<{
  player: Player
  position: Position
}>

export type GameOptions = Readonly<{
  board: Board
  players: readonly PlayerPlacement[]
  // Composition of each private deck created by addPlayer.
  deck: readonly Instruction[]
  name: string
}>

export class Game {
  readonly id: GameId
  readonly name: string
  readonly board: Board
  private readonly robotPlacements: RobotPlacements
  private readonly roster: Roster
  private readonly deck: readonly Instruction[]
  private readonly lifecycle = new GameLifecycle('programming')
  private registerIndex = 0
  private environment: { stepIndex: number; rebooted?: Set<RobotId> } | null = null
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()
  // What each robot's registers resolved to this round, so Again repeats the real action.
  private readonly resolvedInstructions = new Map<RobotId, (ResolvedInstruction | undefined)[]>()

  constructor({
    board,
    players,
    deck,
    name,
  }: GameOptions) {
    if (deck.length < REGISTER_COUNT) {
      throw new RangeError('The deck must contain at least five cards')
    }

    this.id = randomUUID()
    this.board = board
    this.robotPlacements = new RobotPlacements(board)
    this.name = name
    this.roster = new Roster(players.map(({ player }) => player))
    this.deck = [...deck]
    for (const { player, position } of players) this.robotPlacements.place(player.robot.id, position)
    this.dealInitialHands()
  }

  get lastActivePhase(): GamePhase {
    return this.lifecycle.lastPhase
  }

  get currentRegister(): number {
    return this.registerIndex
  }

  get players(): readonly Player[] {
    return Object.freeze([...this.roster.players])
  }

  requirePhase(phase: GamePhase): Result<void, PhaseError> {
    return this.lifecycle.requirePhase(phase)
  }

  get paused(): boolean {
    return this.lifecycle.isPaused
  }

  get aborted(): boolean {
    return this.lifecycle.isAborted
  }

  get winner(): PlayerId | undefined {
    return this.lifecycle.winnerId
  }

  pause(): Result<void, PauseError> {
    return this.lifecycle.pause()
  }

  resume(): Result<{ roundConcluded: boolean }, ResumeError> {
    return this.lifecycle.resume().map(() => {
      this.recheckProgrammingPhase()
      return this.recheckActivationPhase()
    })
  }

  abort(): Result<void, AbortError> {
    return this.lifecycle.abort()
  }

  hasSubmittedProgram(playerId: PlayerId): boolean {
    return this.submittedPlayerIds.has(playerId)
  }

  getRobotPosition(robotId: RobotId): Position {
    return this.robotPlacements.positionOf(robotId)
  }

  registerViewsFor(player: Player): readonly RegisterView[] {
    return player.registers.publicView(this.registerIndex, this.activatedRobotIds.has(player.robot.id))
  }

  private findSpawn(): Result<Position, 'NO_SPAWN_AVAILABLE'> {
    const free = this.board.startTiles.filter((position) => this.robotPlacements.occupantAt(position) === undefined)
    if (free.length === 0) return err('NO_SPAWN_AVAILABLE')
    return ok({ ...free[0] })
  }

  private nextAvailableColour(): string {
    return ROBOT_COLOURS.find((colour) => !this.roster.players.some((player) => player.robot.colour === colour))
      ?? ROBOT_COLOURS[this.roster.players.length % ROBOT_COLOURS.length]
  }

  addPlayer(robotSpriteId: RobotSpriteId, colour?: string): Result<Player, AddPlayerError> {
    const assignedColour = colour ?? this.nextAvailableColour()
    return this.findSpawn().map((position) => {
      const robot = new Robot(randomUUID(), Direction.NORTH, assignedColour, robotSpriteId)
      const player = new Player(randomUUID(), robot, Deck.fromTemplate(this.deck))
      player.drawHand()
      this.robotPlacements.place(robot.id, position)
      this.roster.add(player)
      return player
    })
  }

  removePlayer(playerId: PlayerId): { roundConcluded: boolean } {
    const removed = this.roster.remove(playerId)
    if (removed.isErr()) return { roundConcluded: false }
    const player = removed.value
    this.robotPlacements.remove(player.robot.id)
    this.submittedPlayerIds.delete(playerId)
    this.activatedRobotIds.delete(player.robot.id)
    const { roundConcluded } = this.recheckActivationPhase()
    this.recheckProgrammingPhase()
    return { roundConcluded }
  }

  private checkCanSubmitProgram(
    playerId: PlayerId,
  ): Result<Player, Exclude<SubmitProgramError, 'INVALID_PROGRAM'>> {
    return this.requirePhase('programming')
      .andThen(() => this.roster.getPlayer(playerId))
      .andThen((player) => this.submittedPlayerIds.has(player.id) ? err('ALREADY_SUBMITTED') : ok(player))
  }

  private checkProgram(player: Player, cardIds: readonly CardId[]): Result<readonly Card[], 'INVALID_PROGRAM'> {
    if (cardIds.length !== REGISTER_COUNT || new Set(cardIds).size !== REGISTER_COUNT) {
      return err('INVALID_PROGRAM')
    }
    const hand = new Map(player.hand.map((card) => [card.id, card]))
    const program = cardIds.map((id) => hand.get(id))
    if (!program.every((card): card is Card => card !== undefined)) {
      return err('INVALID_PROGRAM')
    }
    return ok(program)
  }

  submitProgram(playerId: PlayerId, cardIds: readonly CardId[]): Result<CompletedProgram, SubmitProgramError> {
    return this.checkCanSubmitProgram(playerId).andThen((player) =>
      this.checkProgram(player, cardIds).map((program) => {
        this.applyProgram(player, program)
        return { playerId: player.id, cards: program }
      }),
    )
  }

  private applyProgram(player: Player, program: readonly Card[]): void {
    player.updateRegisters(program)
    // Programmed cards stay out of both piles until the round ends.
    player.discard(player.hand.filter((card) => !program.includes(card)))
    player.clearHand()
    this.submittedPlayerIds.add(player.id)
    this.recheckProgrammingPhase()
  }

  completePrograms(): Result<readonly CompletedProgram[], SubmitProgramError> {
    const phase = this.requirePhase('programming')
    if (phase.isErr() && (phase.error !== 'GAME_PAUSED' || this.lastActivePhase !== 'programming')) {
      return err(phase.error)
    }

    // The deadline can finalize programs while gameplay remains paused.
    const validatedPrograms: { player: Player; cards: readonly Card[] }[] = []
    for (const player of this.players) {
      if (this.submittedPlayerIds.has(player.id)) continue
      const selectedIds = new Set(player.registers.slots.map((card) => card?.id))
      const available = player.hand.filter((card) => !selectedIds.has(card.id))
      const cards = player.registers.slots.map((card) => card ?? available.shift())
      if (!cards.every((card): card is Card => card !== undefined)) return err('INVALID_PROGRAM')
      const checked = this.checkProgram(player, cards.map((card) => card.id))
      if (checked.isErr()) return err(checked.error)
      validatedPrograms.push({ player, cards: checked.value })
    }

    // Validate every completion before submitting any of them.
    for (const { player, cards } of validatedPrograms) {
      this.applyProgram(player, cards)
    }
    return ok(validatedPrograms.map(({ player, cards }) => ({ playerId: player.id, cards })))
  }

  updateRegisters(playerId: PlayerId, cardIds: readonly (CardId | null)[]): Result<void, UpdateRegistersError> {
    return this.checkCanSubmitProgram(playerId).andThen((player) => {
      const selectedIds = cardIds.filter((id) => id !== null)
      const hand = new Map(player.hand.map((card) => [card.id, card]))
      if (cardIds.length !== 5 || new Set(selectedIds).size !== selectedIds.length ||
          selectedIds.some((id) => !hand.has(id))) {
        return err('INVALID_PROGRAM')
      }
      const program: readonly (Card | null)[] = cardIds.map((id) => id === null ? null : hand.get(id)!)
      player.updateRegisters(program)
      return ok(undefined)
    })
  }

  private recheckProgrammingPhase(): void {
    if (
      this.requirePhase('programming').isOk() &&
      this.players.length > 0 &&
      this.players.every((player) => this.submittedPlayerIds.has(player.id))
    ) {
      this.startActivationPhase()
    }
  }

  get hasPendingEnvironment(): boolean {
    return this.environment !== null
  }

  private recheckActivationPhase(): { roundConcluded: boolean } {
    if (this.requirePhase('activation').isErr()) {
      return { roundConcluded: false }
    }
    if (this.roster.players.length === 0) return this.concludeRegister()
    if (!this.hasPendingEnvironment && this.activatedRobotIds.size === this.roster.players.length) {
      this.environment = { stepIndex: 0 }
    }
    return { roundConcluded: false }
  }

  executeNextStep(): ActivationStep {
    if (this.requirePhase('activation').isErr()) throw new Error('Game is not executing')
    const environment = this.environment
    if (environment === null) return { type: 'robot', result: this.executeNextAction() }

    const snapshot = captureEnvironmentSnapshot(this.board, this.robotPlacements, this.roster.players)
    const changes = environmentSteps[environment.stepIndex](snapshot, this.board, environment.rebooted)
    const reboots: RebootResult[] = []
    if (changes.kind === 'CHECKPOINTS') {
      for (const { playerId, lastCheckpoint } of changes.checkpointProgress) {
        this.roster.requirePlayer(playerId).completeCheckpoint(lastCheckpoint)
        if (lastCheckpoint === this.board.checkpointCount) this.lifecycle.finish(playerId)
      }
    } else {
      if (changes.kind === 'CONVEYORS') this.robotPlacements.applyConveyorMoves(changes.robots)
      for (const { robotId, position, direction } of changes.robots) {
        const robot = this.roster.requireOwner(robotId).robot
        robot.turn(direction - robot.direction)
        if (changes.kind === 'CONVEYORS') this.resolveMovementEntry(robot, position, reboots)
      }
    }

    if (reboots.length > 0) {
      const rebooted = environment.rebooted ??= new Set()
      for (const { robotId } of reboots) rebooted.add(robotId)
    }
    environment.stepIndex++
    const { roundConcluded } = environment.stepIndex === environmentSteps.length
      ? this.concludeRegister() : { roundConcluded: false }
    const result = changes.kind === 'CONVEYORS' ? {
      ...changes,
      robots: changes.robots.map((robot) => ({ ...robot, position: this.robotPlacements.positionOf(robot.robotId) })),
      reboots,
      roundConcluded,
    } : { ...changes, roundConcluded }
    return { type: 'environment', result }
  }

  private concludeRegister(): { roundConcluded: boolean } {
    this.environment = null
    if (this.roster.players.length === 0) {
      this.finishRound()
      return { roundConcluded: true }
    }
    this.finishRegister()
    if (this.winner !== undefined) {
      this.discardPrograms()
      return { roundConcluded: false }
    }
    if (this.registerIndex === REGISTER_COUNT) {
      this.finishRound()
      return { roundConcluded: true }
    }
    return { roundConcluded: false }
  }

  // Gameplay movement resolves entry effects; Board movement only changes positions.
  private moveRobot(robot: Robot, direction: Direction, steps: PositiveInteger, reboots: RebootResult[]): void {
    for (let step = 0; step < steps; step++) {
      const movedRobotIds = this.robotPlacements.push(robot.id, direction)
      if (movedRobotIds.length === 0) return

      for (const id of movedRobotIds) {
        const movedRobot = this.roster.requireOwner(id).robot
        const entry = this.resolveMovementEntry(movedRobot, this.robotPlacements.positionOf(id), reboots)
        if (id === robot.id && entry === 'stop') return
      }
    }
  }

  executeNextAction(): NextActionResult {
    if (this.hasPendingEnvironment || this.requirePhase('activation').isErr()) {
      throw new Error('Robot actions can only execute during activation')
    }

    const player = this.nextPlayerByPriority()
    if (!player) throw new Error('No robots remain to activate')

    const robot = player.robot
    const registerIndex = this.registerIndex
    const card = player.registers.cardAt(UnsignedInteger(registerIndex))
    const previousPositions = this.roster.players.map((player) => this.robotPlacements.positionOf(player.robot.id))
    const reboots: RebootResult[] = []
    const resolvedInstruction = this.executeCard(robot, card, registerIndex, reboots)
    this.activatedRobotIds.add(robot.id)
    const action: RobotActionResult = {
      robotId: robot.id,
      card,
      resolvedInstruction,
      position: this.robotPlacements.positionOf(robot.id),
      direction: robot.direction,
    }
    const pushedRobots = this.roster.players.flatMap(({ robot: other }, index) => {
      if (other.id === robot.id) return []
      const position = this.robotPlacements.positionOf(other.id)
      const previous = previousPositions[index]
      if (position.x === previous.x && position.y === previous.y) return []
      return [{ robotId: other.id, position, direction: other.direction }]
    })

    const { roundConcluded } = this.recheckActivationPhase()
    return { registerIndex, action, pushedRobots, reboots, roundConcluded }
  }

  private dealInitialHands(): void {
    for (const player of this.players) {
      if (player.hand.length === 0) player.drawHand()
      player.resetRegisters()
    }
  }

  private dealNewHands(): void {
    for (const player of this.players) {
      player.drawHand()
      player.resetRegisters()
    }
  }

  private startActivationPhase(): void {
    this.lifecycle.enterActivation()
    this.registerIndex = 0
    this.activatedRobotIds.clear()
    this.resolvedInstructions.clear()
  }

  private nextPlayerByPriority(): Player | undefined {
    let nextPlayer: Player | undefined
    let nearestDistance = Infinity
    let smallestOffset = Infinity
    const fullTurn = 2 * Math.PI
    const antenna = this.board.antenna
    const antennaAngle = antenna.angle % fullTurn

    // Radians start east and increase clockwise because board y increases south.
    // Recheck current positions every action; exact ties retain roster order.
    for (const player of this.players) {
      if (this.activatedRobotIds.has(player.robot.id)) continue
      const position = this.robotPlacements.positionOf(player.robot.id)
      const dx = position.x - antenna.x
      const dy = position.y - antenna.y
      const distance = Math.abs(dx) + Math.abs(dy)
      if (distance > nearestDistance) continue
      const angle = Math.atan2(dy, dx)
      const offset = ((angle - antennaAngle) % fullTurn + fullTurn) % fullTurn
      if (distance < nearestDistance || (distance === nearestDistance && offset < smallestOffset)) {
        nextPlayer = player
        nearestDistance = distance
        smallestOffset = offset
      }
    }
    return nextPlayer
  }

  private executeCard(robot: Robot, card: Card, registerIndex: number, reboots: RebootResult[]): ResolvedInstruction | undefined {
    // Again repeats what the previous register resolved to (nothing in register 0).
    // TODO: With damage cards, Again after a damage card instead draws the top
    // card of the player's deck and resolves that.
    const history = this.resolvedInstructions.get(robot.id) ?? []
    const resolved = card.instruction === 'AGAIN' ? history[registerIndex - 1] : card.instruction
    history[registerIndex] = resolved
    this.resolvedInstructions.set(robot.id, history)
    if (resolved === undefined) return undefined

    const effect = effects[resolved]
    if (effect.kind === 'move') {
      const direction = effect.steps < 0 ? opposite(robot.direction) : robot.direction
      this.moveRobot(robot, direction, PositiveInteger(Math.abs(effect.steps)), reboots)
    } else {
      robot.turn(effect.quarterTurns)
    }
    return resolved
  }

  private resolveMovementEntry(robot: Robot, position: Position, reboots: RebootResult[]): 'continue' | 'stop' {
    const tile = this.board.getTile(position)
    const effect = tile === undefined ? 'reboot' : tile.entryEffect
    switch (effect) {
      case undefined:
        return 'continue'
      case 'reboot':
        reboots.push(this.rebootRobot(robot, position))
        return 'stop'
      default: {
        const unexpectedEffect: never = effect
        throw new Error(`Unsupported tile entry effect: ${String(unexpectedEffect)}`)
      }
    }
  }

  // Reboots on the free reboot tile closest to where the robot fell; ties keep board order.
  private rebootRobot(robot: Robot, fellAt: Position): RebootResult {
    const distance = (tile: Position) => Math.abs(tile.x - fellAt.x) + Math.abs(tile.y - fellAt.y)
    const closestFirst = [...this.board.rebootTiles].sort((a, b) => distance(a) - distance(b))
    const destination = closestFirst.find((tile) => this.robotPlacements.occupantAt(tile) === undefined)
      ?? this.robotPlacements.nearestFreePosition(closestFirst[0])
    if (destination === undefined) throw new Error('No safe reboot destination is available')
    this.robotPlacements.relocate(robot.id, destination)
    // TODO: Add two SPAM cards and cancel this robot's remaining registers.
    return { robotId: robot.id, fellAt: { ...fellAt }, landedAt: { ...destination } }
  }

  private finishRegister(): void {
    this.activatedRobotIds.clear()
    this.registerIndex++
  }

  private discardPrograms(): void {
    for (const player of this.players) player.discardProgram()
    this.submittedPlayerIds.clear()
  }

  private finishRound(): void {
    this.discardPrograms()
    this.registerIndex = 0
    this.dealNewHands()
    this.lifecycle.enterProgramming()
  }
}
