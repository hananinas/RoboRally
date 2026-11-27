import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import type { Board } from '@/domain/game/Board'
import { effects, type Instruction, type PrivateProgram, type PublicRegisters, type ResolvedInstruction, type RobotSpriteId } from '@robo-rally/game-events'
import { captureEnvironmentSnapshot, environmentSteps, type EnvironmentChanges } from '@/domain/game/environment'
import { Card } from '@/domain/game/Card'
import { Deck } from '@/domain/game/Deck'
import type { CardId, GameId, PlayerId, RobotId } from '@/domain/game/ids'
import { Player } from '@/domain/game/Player'
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
  registers: PublicRegisters
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
}>

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

const REGISTERS_PER_ROUND = 5

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
  // Reboots recorded while the current action resolves.
  private actionReboots: RebootResult[] = []
  private environmentStepIndex: number | null = null
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
    if (deck.length < REGISTERS_PER_ROUND) {
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
    player.robot.clearProgram()
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
    if (cardIds.length !== REGISTERS_PER_ROUND || new Set(cardIds).size !== REGISTERS_PER_ROUND) {
      return err('INVALID_PROGRAM')
    }
    const hand = new Map(player.hand.map((card) => [card.id, card]))
    const program = cardIds.map((id) => hand.get(id))
    if (!program.every((card): card is Card => card !== undefined)) {
      return err('INVALID_PROGRAM')
    }
    return ok(program)
  }

  submitProgram(playerId: PlayerId, cardIds: readonly CardId[]): Result<void, SubmitProgramError> {
    return this.checkCanSubmitProgram(playerId).andThen((player) =>
      this.checkProgram(player, cardIds).map((program) => this.applyProgram(player, program)),
    )
  }

  private applyProgram(player: Player, program: readonly Card[]): void {
    player.robot.setProgram(program)
    player.updateRegisters(program as PrivateProgram)
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
      const selectedIds = new Set(player.program.map((card) => card?.id))
      const available = player.hand.filter((card) => !selectedIds.has(card.id))
      const cards = player.program.map((card) => card ?? available.shift())
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
      player.updateRegisters(program as PrivateProgram)
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
    return this.environmentStepIndex !== null
  }

  private recheckActivationPhase(): { roundConcluded: boolean } {
    if (this.requirePhase('activation').isErr()) {
      return { roundConcluded: false }
    }
    if (this.roster.players.length === 0) return this.concludeRegister()
    if (!this.hasPendingEnvironment && this.activatedRobotIds.size === this.roster.players.length) {
      this.environmentStepIndex = 0
    }
    return { roundConcluded: false }
  }

  executeNextStep(): ActivationStep {
    if (this.requirePhase('activation').isErr()) throw new Error('Game is not executing')
    const index = this.environmentStepIndex
    if (index === null) return { type: 'robot', result: this.executeNextAction() }

    const changes = environmentSteps[index](captureEnvironmentSnapshot(this.board, this.robotPlacements, this.roster.players))
    if (changes.kind === 'GEARS') {
      for (const { robotId, direction } of changes.robots) {
        const robot = this.roster.requireOwner(robotId).robot
        robot.turn(direction - robot.direction)
      }
    } else {
      for (const { playerId, lastCheckpoint } of changes.checkpointProgress) {
        this.roster.requirePlayer(playerId).completeCheckpoint(lastCheckpoint)
        if (lastCheckpoint === this.board.checkpointCount) this.lifecycle.finish(playerId)
      }
    }

    this.environmentStepIndex = index + 1
    const { roundConcluded } = this.environmentStepIndex === environmentSteps.length
      ? this.concludeRegister() : { roundConcluded: false }
    return {
      type: 'environment',
      result: { ...changes, roundConcluded },
    }
  }

  private concludeRegister(): { roundConcluded: boolean } {
    this.environmentStepIndex = null
    if (this.roster.players.length === 0) {
      this.finishRound()
      return { roundConcluded: true }
    }
    this.finishRegister()
    if (this.winner !== undefined) {
      this.clearRound()
      return { roundConcluded: false }
    }
    if (this.registerIndex === REGISTERS_PER_ROUND) {
      this.finishRound()
      return { roundConcluded: true }
    }
    return { roundConcluded: false }
  }

  // Gameplay movement resolves entry effects; Board movement only changes positions.
  private moveRobot(robot: Robot, direction: Direction, steps: PositiveInteger): void {
    for (let step = 0; step < steps; step++) {
      const movedRobotIds = this.robotPlacements.push(robot.id, direction)
      if (movedRobotIds.length === 0) return

      for (const id of movedRobotIds) {
        const movedRobot = this.roster.requireOwner(id).robot
        const entry = this.resolveMovementEntry(movedRobot, this.robotPlacements.positionOf(id))
        if (id === robot.id && entry === 'stop') return
      }
    }
  }

  executeNextAction(): NextActionResult {
    if (this.hasPendingEnvironment || this.requirePhase('activation').isErr()) {
      throw new Error('Robot actions can only execute during activation')
    }

    const robot = this.nextRobotByPriority()
    if (!robot) throw new Error('No robots remain to activate')

    const registerIndex = this.registerIndex
    const card = robot.getProgramCard(UnsignedInteger(registerIndex))
    const previousPositions = this.roster.players.map((player) => this.robotPlacements.positionOf(player.robot.id))
    this.actionReboots = []
    const resolvedInstruction = this.executeCard(robot, card, registerIndex)
    const reboots = this.actionReboots
    this.actionReboots = []
    this.activatedRobotIds.add(robot.id)
    const player = this.roster.requireOwner(robot.id)
    const registers = player.revealRegister(registerIndex, card.instruction)
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
    return { registerIndex, action, registers, pushedRobots, reboots, roundConcluded }
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

  private nextRobotByPriority(): Robot | undefined {
    let nextRobot: Robot | undefined
    let nearestDistance = Infinity
    let smallestOffset = Infinity
    const fullTurn = 2 * Math.PI
    const antenna = this.board.antenna
    const antennaAngle = antenna.angle % fullTurn

    // Radians start east and increase clockwise because board y increases south.
    // Recheck current positions every action; exact ties retain roster order.
    for (const { robot } of this.players) {
      if (this.activatedRobotIds.has(robot.id)) continue
      const position = this.robotPlacements.positionOf(robot.id)
      const dx = position.x - antenna.x
      const dy = position.y - antenna.y
      const distance = Math.abs(dx) + Math.abs(dy)
      if (distance > nearestDistance) continue
      const angle = Math.atan2(dy, dx)
      const offset = ((angle - antennaAngle) % fullTurn + fullTurn) % fullTurn
      if (distance < nearestDistance || (distance === nearestDistance && offset < smallestOffset)) {
        nextRobot = robot
        nearestDistance = distance
        smallestOffset = offset
      }
    }
    return nextRobot
  }

  private executeCard(robot: Robot, card: Card, registerIndex: number): ResolvedInstruction | undefined {
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
      this.moveRobot(robot, direction, PositiveInteger(Math.abs(effect.steps)))
    } else {
      robot.turn(effect.quarterTurns)
    }
    return resolved
  }

  private resolveMovementEntry(robot: Robot, position: Position): 'continue' | 'stop' {
    const tile = this.board.getTile(position)
    const effect = tile === undefined ? 'reboot' : tile.entryEffect
    switch (effect) {
      case undefined:
        return 'continue'
      case 'reboot':
        this.rebootRobot(robot, position)
        return 'stop'
      default: {
        const unexpectedEffect: never = effect
        throw new Error(`Unsupported tile entry effect: ${String(unexpectedEffect)}`)
      }
    }
  }

  // Reboots on the free reboot tile closest to where the robot fell; ties keep board order.
  private rebootRobot(robot: Robot, fellAt: Position): void {
    const distance = (tile: Position) => Math.abs(tile.x - fellAt.x) + Math.abs(tile.y - fellAt.y)
    const closestFirst = [...this.board.rebootTiles].sort((a, b) => distance(a) - distance(b))
    const destination = closestFirst.find((tile) => this.robotPlacements.occupantAt(tile) === undefined)
      ?? this.robotPlacements.nearestFreePosition(closestFirst[0])
    if (destination === undefined) throw new Error('No safe reboot destination is available')
    this.robotPlacements.relocate(robot.id, destination)
    this.actionReboots.push({ robotId: robot.id, fellAt: { ...fellAt }, landedAt: { ...destination } })
    // TODO: Add two SPAM cards and cancel this robot's remaining registers.
  }

  private finishRegister(): void {
    this.activatedRobotIds.clear()
    this.registerIndex++
  }

  private clearRound(): void {
    for (const player of this.players) {
      player.discard(player.robot.program)
      player.robot.clearProgram()
    }
    this.submittedPlayerIds.clear()
    this.registerIndex = 0
  }

  private finishRound(): void {
    this.clearRound()
    this.dealNewHands()
    this.lifecycle.enterProgramming()
  }
}
