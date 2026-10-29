import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import type { Board } from '@/game/Board'
import { instructions } from '@robo-rally/game-events'
import { Card } from '@/game/Card'
import type { CardId, PlayerId, RobotId } from '@/game/ids'
import { Player } from '@/game/Player'
import { ROBOT_COLOURS, Robot } from '@/game/Robot'
import { tileDefinitions } from '@/game/Tile'
import { Direction, opposite, type Position } from '@/game/spatial'
import { Integer, PositiveInteger, UnsignedInteger } from '@/numbers'

export type GamePhase = 'programming' | 'activation'

export type RobotActionResult = Readonly<{
  robotId: RobotId
  card: Card
  position: Position
  direction: Direction
}>

export type NextActionResult = Readonly<{
  registerIndex: number
  action: RobotActionResult
  pushedRobots: readonly Readonly<{
    robotId: RobotId
    position: Position
    direction: Direction
  }>[]
}>

export type AddPlayerError = 'GAME_ALREADY_STARTED' | 'NO_SPAWN_AVAILABLE'

export type SubmitProgramError =
  | 'GAME_ABORTED'
  | 'GAME_FINISHED'
  | 'GAME_PAUSED'
  | 'WRONG_PHASE'
  | 'PLAYER_NOT_IN_GAME'
  | 'ALREADY_SUBMITTED'
  | 'INVALID_PROGRAM'
export const DEFAULT_GAME_NAME = 'Game'

export class Game {
  readonly name: string
  readonly board: Board
  private readonly roster: Player[]
  readonly rebootTile: Position
  private readonly deck: readonly Card[]
  private currentPhase: GamePhase = 'programming'
  private registerIndex = 0
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()
  private started = false
  private isPaused = false
  private isAborted = false
  private winnerId: PlayerId | undefined

  constructor(
    board: Board,
    players: readonly Player[],
    deck: readonly Card[],
    rebootTile: Position,
    name: string = DEFAULT_GAME_NAME,
  ) {
    if (deck.length < 5 || new Set(deck.map((card) => card.id)).size !== deck.length) {
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

  get aborted(): boolean {
    return this.isAborted
  }

  get winner(): PlayerId | undefined {
    return this.winnerId
  }

  pause(): void {
    this.isPaused = true
  }

  resume(): void {
    this.isPaused = false
  }

  abort(): void {
    this.isAborted = true
  }

  hasSubmittedProgram(playerId: PlayerId): boolean {
    return this.submittedPlayerIds.has(playerId)
  }

  private checkCanAddPlayer(): Result<void, 'GAME_ALREADY_STARTED'> {
    if (this.started) return err('GAME_ALREADY_STARTED')
    return ok(undefined)
  }

  private findSpawn(): Result<Position, 'NO_SPAWN_AVAILABLE'> {
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

  addPlayer(colour: string = ROBOT_COLOURS[0]): Result<Player, AddPlayerError> {
    return this.checkCanAddPlayer().andThen(() =>
      this.findSpawn().map((position) => {
        const robot = new Robot(randomUUID(), Direction.NORTH, colour)
        const hand = this.deck.map((card) => new Card(randomUUID(), card.instruction))
        const player = new Player(randomUUID(), robot, hand)
        this.board.placeRobot(robot.id, position)
        this.roster.push(player)
        return player
      }),
    )
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

  private checkCanSubmitProgram(
    playerId: PlayerId,
  ): Result<Player, Exclude<SubmitProgramError, 'INVALID_PROGRAM'>> {
    if (this.isAborted) return err('GAME_ABORTED')
    if (this.winnerId !== undefined) return err('GAME_FINISHED')
    if (this.isPaused) return err('GAME_PAUSED')
    if (this.currentPhase !== 'programming') return err('WRONG_PHASE')

    const player = this.players.find((candidate) => candidate.id === playerId)
    if (!player) return err('PLAYER_NOT_IN_GAME')
    if (this.submittedPlayerIds.has(playerId)) return err('ALREADY_SUBMITTED')

    return ok(player)
  }

  private checkProgram(player: Player, cardIds: readonly CardId[]): Result<readonly Card[], 'INVALID_PROGRAM'> {
    if (cardIds.length !== 5 || new Set(cardIds).size !== 5) {
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
      this.checkProgram(player, cardIds).map((program) => {
        player.robot.setProgram(program)
        this.started = true
        this.submittedPlayerIds.add(playerId)
        this.recheckProgrammingPhase()
      }),
    )
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
    if (this.currentPhase !== 'activation') {
      throw new Error('Robot actions can only execute during activation')
    }

    const robot = this.nextRobotByPriority()
    if (!robot) throw new Error('No robots remain to activate')

    const registerIndex = this.registerIndex
    const card = robot.getProgramCard(UnsignedInteger(registerIndex))
    const previousPositions = this.roster.map((player) => this.board.positionOf(player.robot.id))
    this.executeCard(robot, card)
    this.activatedRobotIds.add(robot.id)
    const action: RobotActionResult = {
      robotId: robot.id,
      card,
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

    if (this.activatedRobotIds.size === this.players.length) {
      this.activateBoardElements()
      this.finishRegister()
    }
    return { registerIndex, action, pushedRobots }
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

  private executeCard(robot: Robot, card: Card): void {
    const effect = instructions[card.instruction]
    if (effect.kind === 'move') {
      const direction = effect.steps < 0 ? opposite(robot.direction) : robot.direction
      this.moveRobot(robot, direction, PositiveInteger(Math.abs(effect.steps)))
    } else {
      robot.turn(effect.quarterTurns)
    }
  }

  private resolveMovementEntry(robot: Robot, position: Position): 'continue' | 'stop' {
    const tile = this.board.getTile(position)
    const effect = tile === undefined ? 'reboot' : tileDefinitions[tile.kind].entryEffect
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

  private activateBoardElements(): void {
    for (const player of this.players) {
      const position = this.board.positionOf(player.robot.id)
      const checkpoint = this.board.getTile(position)?.checkpointNumber
      if (checkpoint === undefined || !player.completeCheckpoint(checkpoint)) continue
      if (checkpoint === this.board.checkpointCount) this.winnerId = player.id
    }
  }

  private finishRegister(): void {
    this.activatedRobotIds.clear()
    this.registerIndex++
    if (this.registerIndex === 5 || this.winnerId !== undefined) this.finishRound()
  }

  private finishRound(): void {
    for (const player of this.players) player.robot.clearProgram()
    this.submittedPlayerIds.clear()
    this.registerIndex = 0
    this.dealCards()
    this.currentPhase = 'programming'
  }
}
