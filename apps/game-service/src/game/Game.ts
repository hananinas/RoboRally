import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import type { Board } from '@/game/Board'
import { instructions } from '@robo-rally/game-events'
import { Card } from '@/game/Card'
import type { CardId, PlayerId, RobotId } from '@/game/ids'
import { Player } from '@/game/Player'
import { Robot } from '@/game/Robot'
import { PitTile, tileDefinitions } from '@/game/Tile'
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
}>

export type AddPlayerError = 'GAME_ALREADY_STARTED' | 'NO_SPAWN_AVAILABLE'

export type SubmitProgramError =
  | 'GAME_ABORTED'
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
  readonly rebootTile?: Position
  private readonly deck: readonly Card[]
  private currentPhase: GamePhase = 'programming'
  private registerIndex = 0
  private readonly submittedPlayerIds = new Set<PlayerId>()
  private readonly activatedRobotIds = new Set<RobotId>()
  private started = false
  private isPaused = false
  private isAborted = false

  constructor(
    board: Board,
    players: readonly Player[],
    deck: readonly Card[],
    name: string = DEFAULT_GAME_NAME,
    rebootTile?: Position,
  ) {
    if (deck.length < 5 || new Set(deck.map((card) => card.id)).size !== deck.length) {
      throw new RangeError('The deck must contain at least five distinct cards')
    }
    if (board.hasEntryEffect('reboot') && rebootTile === undefined) {
      throw new RangeError('A board with pits requires a reboot tile')
    }
    if (rebootTile !== undefined) {
      const tile = board.getTile(rebootTile)
      if (tile === undefined || !tileDefinitions[tile.kind].canOccupy) {
        throw new RangeError('Reboot tile must be a non-pit tile on the board')
      }
    }

    const playerIds = new Set<PlayerId>()
    const robotIds = new Set<RobotId>()
    for (const player of players) {
      if (playerIds.has(player.id) || robotIds.has(player.robot.id)) {
        throw new RangeError('Players and robots must have unique IDs')
      }
      const tile = board.getTile(board.positionOf(player.robot.id))
      if (tile === undefined || !tileDefinitions[tile.kind].canOccupy) {
        throw new RangeError('Robots cannot start on pits')
      }
      playerIds.add(player.id)
      robotIds.add(player.robot.id)
    }

    this.board = board
    this.name = name
    this.roster = [...players]
    this.rebootTile = rebootTile === undefined ? undefined : Object.freeze({ ...rebootTile })
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
      const tile = this.board.getTile(position)
      if (tile !== undefined && tileDefinitions[tile.kind].canOccupy &&
          this.board.occupantAt(position) === undefined) return ok(position)
      x--
    }
    return err('NO_SPAWN_AVAILABLE')
  }

  addPlayer(): Result<Player, AddPlayerError> {
    return this.checkCanAddPlayer().andThen(() =>
      this.findSpawn().map((position) => {
        const robot = new Robot(randomUUID(), Direction.NORTH)
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
  ): Result<Player, 'GAME_ABORTED' | 'GAME_PAUSED' | 'WRONG_PHASE' | 'PLAYER_NOT_IN_GAME' | 'ALREADY_SUBMITTED'> {
    if (this.isAborted) return err('GAME_ABORTED')
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

  executeNextAction(): NextActionResult {
    if (this.currentPhase !== 'activation') {
      throw new Error('Robot actions can only execute during activation')
    }

    const robot = this.nextRobotByPriority()
    if (!robot) throw new Error('No robots remain to activate')

    const registerIndex = this.registerIndex
    const card = robot.getProgramCard(UnsignedInteger(registerIndex))
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
      const movement = this.board.moveRobot(robot.id, direction, PositiveInteger(Math.abs(effect.steps)))
      if (movement.stepsMoved > 0 && this.board.getTile(movement.position) instanceof PitTile) {
        this.rebootRobot(robot)
      }
    } else {
      robot.turn(effect.quarterTurns)
    }
  }

  private rebootRobot(robot: Robot): void {
    if (this.rebootTile === undefined) throw new Error('Pit reboot requires a configured reboot tile')
    const destination = this.board.nearestFreePosition(this.rebootTile)
    if (destination === undefined) throw new Error('No safe reboot destination is available')
    this.board.relocateRobot(robot.id, destination)
    // TODO: Add two SPAM cards and cancel this robot's remaining registers.
  }

  private activateBoardElements(): void {
    for (const player of this.players) {
      const position = this.board.positionOf(player.robot.id)
      const checkpoint = this.board.getTile(position)?.checkpointNumber
      if (checkpoint !== undefined) player.completeCheckpoint(checkpoint)
    }
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
