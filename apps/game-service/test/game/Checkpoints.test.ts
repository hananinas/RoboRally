import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, Game, Player, Robot } from '@/game/index'
import { Integer } from '@/numbers'

function createGame(starts = [{ x: 0, y: 1, direction: Direction.EAST }]) {
  const tiles = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  tiles[1][1] = new EmptyTile([], 1)
  tiles[1][3] = new EmptyTile([], 2)
  const board = new Board(tiles, { x: Integer(0), y: Integer(0), angle: 0 })
  const players = starts.map(({ x, y, direction }, index) => {
    const robot = new Robot(`robot-${index}`, direction)
    board.placeRobot(robot.id, { x: Integer(x), y: Integer(y) })
    return new Player(`player-${index}`, robot)
  })
  const cards = {
    step: new Card('step', 'MOVE_1'),
    stepAgain: new Card('step-again', 'MOVE_1'),
    move2: new Card('move-2', 'MOVE_2'),
    back: new Card('back', 'BACK_UP'),
    left: new Card('left', 'TURN_LEFT'),
    right: new Card('right', 'TURN_RIGHT'),
    uturn: new Card('uturn', 'U_TURN'),
  }
  for (const player of players) player.deck.add(Object.values(cards))
  const game = new Game({ board, players, deck: Object.values(cards), rebootTile: { x: Integer(0), y: Integer(2) }, random: () => 0 })
  return { board, players, cards, game }
}

describe('checkpoint activation', () => {
  it('checks final positions after every robot has acted in the register', () => {
    const { players, cards: c, game } = createGame([
      { x: 0, y: 1, direction: Direction.EAST },
      { x: 4, y: 2, direction: Direction.NORTH },
    ])
    for (const player of players) game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))

    expect(game.executeNextAction().action.robotId).toBe(players[0].robot.id)
    expect(players[0].lastCheckpoint).toBe(0)
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    expect(game.currentRegister).toBe(1)
    expect(game.winner).toBeUndefined()
  })

    it('ignores passed checkpoints and wins by completing the final checkpoint in order', () => {
    const { board, players: [player], cards: c, game } = createGame()
    const program = [c.move2, c.back, c.step, c.stepAgain, c.left]
    game.submitProgram(player.id, program.map((card) => card.id))
    const progress = program.slice(0, 4).map(() => {
      game.executeNextAction()
      return player.lastCheckpoint
    })

    expect(progress).toEqual([0, 1, 1, 2])
    expect(board.getTile({ x: Integer(1), y: Integer(1) })?.checkpointNumber).toBe(1)
    expect(board.getTile({ x: Integer(3), y: Integer(1) })?.checkpointNumber).toBe(2)
    expect(game.winner).toBe(player.id)
  })

  it('skips the remaining registers and rejects programs after a win', () => {
    const { players: [player], cards: c, game } = createGame([{ x: 2, y: 1, direction: Direction.EAST }])
    player.completeCheckpoint(1)
    const program = [c.step, c.left, c.right, c.uturn, c.back]
    game.submitProgram(player.id, program.map((card) => card.id))

    game.executeNextAction()

    expect(game.winner).toBe(player.id)
    expect(game.lastActivePhase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(player.robot.program).toEqual([])
    expect(game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrapErr()).toBe('GAME_FINISHED')
  })

  it('reports roundConcluded as false when a win lands exactly on the final register', () => {
    const { players: [player], cards: c, game } = createGame([{ x: 2, y: 1, direction: Direction.EAST }])
    player.completeCheckpoint(1)
    const program = [c.left, c.right, c.back, c.step, c.stepAgain]
    game.submitProgram(player.id, program.map((card) => card.id))

    for (let register = 0; register < 4; register++) {
      expect(game.executeNextAction().roundConcluded).toBe(false)
    }
    expect(game.winner).toBeUndefined()

    const result = game.executeNextAction()

    expect(game.winner).toBe(player.id)
    expect(result.roundConcluded).toBe(false)
    expect(game.lastActivePhase).toBe('activation')
  })

  it('rejects register updates after a checkpoint win', () => {
    const { board, players: [player], cards: c, game } = createGame()
    const program = [c.move2, c.back, c.step, c.stepAgain, c.left]
    game.updateRegisters(player.id, [true, true, true, true, true])._unsafeUnwrap()
    game.submitProgram(player.id, program.map((card) => card.id))._unsafeUnwrap()
    for (let register = 0; register < 4; register++) game.executeNextAction()

    expect(player.lastCheckpoint).toBe(2)
    expect(game.winner).toBe(player.id)
    expect(game.lastActivePhase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(game.hasSubmittedProgram(player.id)).toBe(false)
    expect(player.robot.program).toEqual([])
    expect(player.registers).toEqual([
      ...program.slice(0, 4).map((card) => ({ status: 'REVEALED', instruction: card.instruction })),
      { status: 'HIDDEN' },
    ])

    const registers = player.registers
    const state = () => ({
      phase: game.lastActivePhase,
      currentRegister: game.currentRegister,
      hasStarted: game.hasStarted,
      paused: game.paused,
      aborted: game.aborted,
      winner: game.winner,
      players: game.players,
      registers: player.registers.map((register) => ({ ...register })),
      program: player.robot.program,
      hand: player.hand,
      submitted: game.hasSubmittedProgram(player.id),
      lastCheckpoint: player.lastCheckpoint,
      direction: player.robot.direction,
      position: board.positionOf(player.robot.id),
    })
    const expectRejected = (playerId: string, error: 'GAME_FINISHED') => {
      const before = state()
      expect(game.updateRegisters(playerId, [true, true, true, true, true])._unsafeUnwrapErr()).toBe(error)
      expect(player.registers).toBe(registers)
      expect(state()).toEqual(before)
    }

    expectRejected(player.id, 'GAME_FINISHED')
    expectRejected('missing-player', 'GAME_FINISHED')
    game.pause()
    expectRejected(player.id, 'GAME_FINISHED')
    expectRejected('missing-player', 'GAME_FINISHED')
    game.abort()
    expectRejected(player.id, 'GAME_FINISHED')
    expectRejected('missing-player', 'GAME_FINISHED')
  })

  it('does not award a later checkpoint before the next required checkpoint', () => {
    const { players: [player], cards: c, game } = createGame([{ x: 2, y: 1, direction: Direction.EAST }])
    game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))
    for (let register = 0; register < 4; register++) {
      game.executeNextAction()
      expect(player.lastCheckpoint).toBe(0)
    }
  })

  it('awards a checkpoint under a stationary robot after a turn, irrespective of facing', () => {
    const { players: [player], cards: c, game } = createGame([{ x: 1, y: 1, direction: Direction.EAST }])
    expect(player.lastCheckpoint).toBe(0)
    game.submitProgram(player.id, [c.left, c.right, c.uturn, c.step, c.back].map((card) => card.id))
    expect(player.lastCheckpoint).toBe(0)
    for (let register = 0; register < 3; register++) {
      game.executeNextAction()
      expect(player.lastCheckpoint).toBe(1)
    }
  })

  it('keeps progress independent when players visit the same permanent checkpoint', () => {
    const { players, cards: c, game } = createGame([
      { x: 0, y: 1, direction: Direction.EAST },
      { x: 1, y: 2, direction: Direction.NORTH },
    ])
    game.submitProgram(players[0].id, [c.step, c.stepAgain, c.left, c.right, c.uturn].map((card) => card.id))
    game.submitProgram(players[1].id, [c.left, c.right, c.step, c.stepAgain, c.uturn].map((card) => card.id))
    game.executeNextAction()
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    game.executeNextAction()
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    game.executeNextAction()
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 1])
  })

  it('checks the remaining robots when a departure completes the register', () => {
    const { players, cards: c, game } = createGame([
      { x: 0, y: 1, direction: Direction.EAST },
      { x: 4, y: 2, direction: Direction.NORTH },
    ])
    for (const player of players) game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))
    game.executeNextAction()
    expect(players[0].lastCheckpoint).toBe(0)
    game.removePlayer(players[1].id)
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    expect(game.currentRegister).toBe(1)
  })


  it('declares the winner when a departure completes the register', () => {
    const { players, cards: c, game } = createGame([
      { x: 2, y: 1, direction: Direction.EAST },
      { x: 4, y: 2, direction: Direction.NORTH },
    ])
    players[0].completeCheckpoint(1)
    for (const player of players) game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))
    game.executeNextAction()
    expect(game.winner).toBeUndefined()

    game.removePlayer(players[1].id)

    expect(game.winner).toBe(players[0].id)
    expect(game.lastActivePhase).toBe('activation')
  })
})
