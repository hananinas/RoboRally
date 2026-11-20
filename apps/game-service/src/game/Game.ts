import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import type { Board } from '@/game/Board'
import { effects, type PrivateProgram, type PublicRegisters, type ResolvedInstruction } from '@robo-rally/game-events'
import { captureEnvironmentSnapshot, environmentStepsFor, type EnvironmentChanges } from '@/game/environment'
import { Card } from '@/game/Card'
import { Deck } from '@/game/Deck'
import type { CardId, PlayerId, RobotId } from '@/game/ids'
import { Player } from '@/game/Player'
import { ROBOT_COLOURS, Robot } from '@/game/Robot'
import { Direction, opposite, type Position } from '@/game/spatial'
import { Integer, PositiveInteger, UnsignedInteger } from '@/numbers'
import {
  GameLifecycle,
  type AbortError,
  type GamePhase,
  type PauseError,
  type PhaseError,
  type ResumeError,
} from '@/game/GameLifecycle'

export type { GamePhase, PauseError, ResumeError, AbortError, PhaseError }

export type RobotActionResult = Readonly<{
  robotId: RobotId
  card: Card
  resolvedInstruction: ResolvedInstruction | undefined
  position: Position
  direction: Direction
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

export const DEFAULT_GAME_NAME = 'Game'

const REGISTERS_PER_ROUND = 5

export type GameOptions = Readonly<{
  board: Board
  players: readonly Player[]
  // Template for each private deck created by addPlayer.
  deck: readonly Card[]
  rebootTile: Position
  name?: string
  // Picks start tiles.
  random?: () => number
  // Draws cards; defaults to `random`.
  drawRandom?: () => number
}>

export class Game {
  readonly name: string
  readonly board: Board
  private readonly roster: Player[]
  readonly rebootTile: Position
  private readonly deck: readonly Card[]
  private readonly lifecycle = new GameLifecycle('programming')
  private registerIndex = 0
  private environmentStepIndex: number | null = null
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()
  private readonly random: () => number
  private readonly drawRandom: () => number
  // What each robot's registers resolved to this round, so Again repeats the real action.
  private readonly resolvedInstructions = new Map<RobotId, (ResolvedInstruction | undefined)[]>()

  constructor({
    board,
    players,
    deck,
    rebootTile,
    name = DEFAULT_GAME_NAME,
    random = Math.random,
    drawRandom = random,
  }: GameOptions) {
    if (deck.length < REGISTERS_PER_ROUND || new Set(deck.map((card) => card.id)).size !== deck.length) {
      throw new RangeError('The deck must contain at least five distinct cards')
    }
    if (rebootTile === undefined) {
      throw new RangeError('A game requires a reboot tile')
    }
    if (!board.allowsPlacement(rebootTile)) {
      throw new RangeError('Reboot tile must be a non-pit tile on the board outside the priority antenna')
    }

    const playerIds = new Set<PlayerId>()
    const robotIds = new Set<RobotId>()
    for (const player of players) {
      if (playerIds.has(player.id) || robotIds.has(player.robot.id)) {
        throw new RangeError('Players and robots must have unique IDs')
      }
      if (!board.allowsPlacement(board.positionOf(player.robot.id))) {
        throw new RangeError('Robots cannot start on pits or the priority antenna')
      }
      playerIds.add(player.id)
      robotIds.add(player.robot.id)
    }

    this.board = board
    this.name = name
    this.roster = [...players]
    this.rebootTile = Object.freeze({ ...rebootTile })
    this.deck = [...deck]
    this.random = random
    this.drawRandom = drawRandom
    this.dealInitialHands()
  }

  get lastActivePhase(): GamePhase {
    return this.lifecycle.lastPhase
  }

  get currentRegister(): number {
    return this.registerIndex
  }

  get players(): readonly Player[] {
    return Object.freeze([...this.roster])
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

  private findSpawn(): Result<Position, 'NO_SPAWN_AVAILABLE'> {
    if (this.board.startTiles.length > 0) return this.findFreeStartTile()

    const { width, height } = this.board
    const y = Math.floor(height / 2)
    let x = Math.floor(width / 2)
    while (x >= 0) {
      const position = { x: Integer(x), y: Integer(y) }
      if (this.board.allowsPlacement(position) &&
          this.board.occupantAt(position) === undefined) return ok(position)
      x--
    }
    return err('NO_SPAWN_AVAILABLE')
  }

  private findFreeStartTile(): Result<Position, 'NO_SPAWN_AVAILABLE'> {
    const free = this.board.startTiles.filter((position) => this.board.occupantAt(position) === undefined)
    if (free.length === 0) return err('NO_SPAWN_AVAILABLE')
    const index = Math.min(Math.floor(this.random() * free.length), free.length - 1)
    return ok({ ...free[index] })
  }

  addPlayer(colour: string = ROBOT_COLOURS[0]): Result<Player, AddPlayerError> {
    return this.findSpawn().map((position) => {
      const robot = new Robot(randomUUID(), Direction.NORTH, colour)
      const player = new Player(randomUUID(), robot, Deck.fromTemplate(this.deck))
      player.drawHand(this.drawRandom)
      this.board.placeRobot(robot.id, position)
      this.roster.push(player)
      return player
    })
  }

  removePlayer(playerId: PlayerId): { roundConcluded: boolean } {
    const index = this.roster.findIndex((player) => player.id === playerId)
    if (index < 0) return { roundConcluded: false }
    const [player] = this.roster.splice(index, 1)
    this.board.removeRobot(player.robot.id)
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
    return this.requirePhase('programming').andThen(() => {
      const player = this.players.find((candidate) => candidate.id === playerId)
      if (!player) return err('PLAYER_NOT_IN_GAME')
      if (this.submittedPlayerIds.has(playerId)) return err('ALREADY_SUBMITTED')

      return ok(player)
    })
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

  recheckProgrammingPhase(): void {
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
    if (this.roster.length === 0) return this.concludeRegister()
    if (!this.hasPendingEnvironment && this.activatedRobotIds.size === this.roster.length) {
      this.environmentStepIndex = 0
    }
    return { roundConcluded: false }
  }

  executeNextStep(): ActivationStep {
    if (this.requirePhase('activation').isErr()) throw new Error('Game is not executing')
    const index = this.environmentStepIndex
    if (index === null) return { type: 'robot', result: this.executeNextAction() }

    const steps = environmentStepsFor(this.board)
    const changes = steps[index](captureEnvironmentSnapshot(this.board, this.roster))
    if (changes.kind === 'GEARS') {
      for (const { robotId, direction } of changes.robots) {
        const robot = this.roster.find(({ robot }) => robot.id === robotId)!.robot
        robot.turn(direction - robot.direction)
      }
    } else if (changes.kind === 'CHECKPOINTS') {
      for (const { playerId, lastCheckpoint } of changes.checkpointProgress) {
        this.roster.find(({ id }) => id === playerId)!.completeCheckpoint(lastCheckpoint)
        if (lastCheckpoint === this.board.checkpointCount) this.lifecycle.finish(playerId)
      }
    }

    this.environmentStepIndex = index + 1
    const { roundConcluded } = this.environmentStepIndex === steps.length
      ? this.concludeRegister() : { roundConcluded: false }
    return {
      type: 'environment',
      result: { ...changes, roundConcluded },
    }
  }

  private concludeRegister(): { roundConcluded: boolean } {
    this.environmentStepIndex = null
    if (this.roster.length === 0) {
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
  moveRobot(robot: Robot, direction: Direction, steps: PositiveInteger): void {
    for (let step = 0; step < steps; step++) {
      const movedRobotIds = this.board.pushRobot(robot.id, direction)
      if (movedRobotIds.length === 0) return

      for (const id of movedRobotIds) {
        const movedRobot = id === robot.id ? robot : this.roster.find((player) => player.robot.id === id)?.robot
        if (movedRobot === undefined) throw new Error(`Pushed robot ${id} is not in the game`)
        const entry = this.resolveMovementEntry(movedRobot, this.board.positionOf(id))
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
    const previousPositions = this.roster.map((player) => this.board.positionOf(player.robot.id))
    const resolvedInstruction = this.executeCard(robot, card, registerIndex)
    this.activatedRobotIds.add(robot.id)
    const player = this.roster.find((candidate) => candidate.robot === robot)!
    const registers = player.revealRegister(registerIndex, card.instruction)
    const action: RobotActionResult = {
      robotId: robot.id,
      card,
      resolvedInstruction,
      position: this.board.positionOf(robot.id),
      direction: robot.direction,
    }
    const pushedRobots = this.roster.flatMap(({ robot: other }, index) => {
      if (other.id === robot.id) return []
      const position = this.board.positionOf(other.id)
      const previous = previousPositions[index]
      if (position.x === previous.x && position.y === previous.y) return []
      return [{ robotId: other.id, position, direction: other.direction }]
    })

    const { roundConcluded } = this.recheckActivationPhase()
    return { registerIndex, action, registers, pushedRobots, roundConcluded }
  }

  private dealInitialHands(): void {
    for (const player of this.players) {
      if (player.hand.length === 0) player.drawHand(this.drawRandom)
      player.resetRegisters()
    }
  }

  private dealNewHands(): void {
    for (const player of this.players) {
      player.drawHand(this.drawRandom)
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
      const position = this.board.positionOf(robot.id)
      const dx = position.x - antenna.x
      const dy = position.y - antenna.y
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
        this.rebootRobot(robot)
        return 'stop'
      default: {
        const unexpectedEffect: never = effect
        throw new Error(`Unsupported tile entry effect: ${String(unexpectedEffect)}`)
      }
    }
  }

  private rebootRobot(robot: Robot): void {
    const destination = this.board.nearestFreePosition(this.rebootTile)
    if (destination === undefined) throw new Error('No safe reboot destination is available')
    this.board.relocateRobot(robot.id, destination)
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
