import type { Instruction } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { Card, ConveyorTile, Deck, Direction, EmptyTile, GearTile, PitTile, type Game, type Tile } from '@/domain/game/index'
import { Integer } from '@/numbers'
import { createTestBoard, createTestGame, createTestPlacement } from '../../fixtures.ts'

const { NORTH, EAST, SOUTH, WEST } = Direction
const at = (x: number, y: number) => ({ x: Integer(x), y: Integer(y) })
const blueEast = () => new ConveyorTile(2, 'straight', EAST)

function startRegister(
  tiles: Tile[][],
  starts: readonly { x: number; y?: number; direction?: Direction; instruction?: Instruction }[],
) {
  const board = createTestBoard(tiles, { ...at(0, 0), angle: 0 }, at(0, tiles.length - 1))
  const programs = starts.map(({ x, y = 1, direction = EAST, instruction = 'AGAIN' }, playerIndex) => {
    const cards = Array.from({ length: 5 }, (_, i) => new Card(`card-${playerIndex}-${i}`, instruction))
    return { cards, placement: createTestPlacement(at(x, y), { direction, deck: new Deck(cards) }) }
  })
  const game = createTestGame({ board, players: programs.map(({ placement }) => placement) })
  for (const { cards, placement } of programs) {
    game.submitProgram(placement.player.id, cards.map(({ id }) => id))._unsafeUnwrap()
  }
  return { game, robots: programs.map(({ placement }) => placement.player.robot) }
}

function pass(game: Game) {
  const step = game.executeNextStep()
  if (step.type !== 'environment' || step.result.kind !== 'CONVEYORS') throw new Error('Expected conveyor pass')
  return step.result
}

describe('conveyor activation', () => {
  it('carries a robot pushed onto blue and stops the follower at the occupied floor on pass two', () => {
    const { game, robots: [pusher, pushed] } = startRegister([
      [new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile()],
      [new EmptyTile(), blueEast(), blueEast(), new EmptyTile()],
      [new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], [{ x: 0, instruction: 'MOVE_1' }, { x: 1 }])
    expect(game.executeNextAction().pushedRobots).toEqual([
      { robotId: pushed.id, position: at(2, 1), direction: EAST },
    ])
    game.executeNextAction()
    expect(pass(game).robots).toEqual([
      { robotId: pusher.id, position: at(2, 1), direction: EAST },
      { robotId: pushed.id, position: at(3, 1), direction: EAST },
    ])
    expect(pass(game).robots).toEqual([])
    expect(game.getRobotPosition(pusher.id)).toEqual(at(2, 1))
    expect(game.getRobotPosition(pushed.id)).toEqual(at(3, 1))
  })

  it('keeps the first move and blocks both robots at a contested second move', () => {
    const { game, robots } = startRegister([
      [new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile()],
      [blueEast(), blueEast(), new ConveyorTile(2, 'left-right', NORTH),
        new ConveyorTile(2, 'straight', WEST), new ConveyorTile(2, 'straight', WEST)],
      [new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], [{ x: 0 }, { x: 4 }])
    for (const _robot of robots) game.executeNextAction()
    expect(pass(game).robots.map(({ position }) => position)).toEqual([at(1, 1), at(3, 1)])
    expect(pass(game).robots).toEqual([])
    expect(robots.map(({ id }) => game.getRobotPosition(id))).toEqual([at(1, 1), at(3, 1)])
  })

  it('turns on a curved blue entry, follows the new exit, then rides green before gears', () => {
    const { game, robots: [robot] } = startRegister([
      [new EmptyTile(), new EmptyTile(), new ConveyorTile(1, 'straight', EAST), new GearTile('CLOCKWISE')],
      [new EmptyTile(), blueEast(), new ConveyorTile(2, 'from-left', NORTH), new EmptyTile()],
      [new EmptyTile(), new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], [{ x: 1, direction: SOUTH }])
    game.executeNextAction()
    expect(pass(game).robots).toEqual([{ robotId: robot.id, position: at(2, 1), direction: EAST }])
    expect(pass(game).robots).toEqual([{ robotId: robot.id, position: at(2, 0), direction: EAST }])
    expect(pass(game).robots).toEqual([{ robotId: robot.id, position: at(3, 0), direction: EAST }])
    expect(game.executeNextStep()).toMatchObject({ type: 'environment', result: {
      kind: 'GEARS', robots: [{ robotId: robot.id, position: at(3, 0), direction: SOUTH }],
    } })
  })

  it('reports a reboot triggered by pass two at the same time as that pass', () => {
    const { game, robots: [robot] } = startRegister([
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
      [blueEast(), blueEast(), new PitTile()],
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], [{ x: 0 }])
    game.executeNextAction()
    expect(pass(game).robots[0].position).toEqual(at(1, 1))
    expect(pass(game)).toMatchObject({
      reboots: [{ robotId: robot.id, fellAt: at(2, 1), landedAt: at(0, 2) }],
      robots: [{ robotId: robot.id, position: at(0, 2), direction: EAST }],
    })
    expect(pass(game).robots).toEqual([])
  })

  it('blocks a head-on swap and the robot behind it', () => {
    const { game, robots } = startRegister([
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
      [blueEast(), blueEast(), new ConveyorTile(2, 'straight', WEST)],
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], [{ x: 0 }, { x: 1 }, { x: 2 }])
    for (const _robot of robots) game.executeNextAction()
    expect(pass(game).robots).toEqual([])
    expect(pass(game).robots).toEqual([])
  })

  it('advances a full loop together', () => {
    const { game, robots } = startRegister([
      [new EmptyTile(), new EmptyTile()],
      [new ConveyorTile(1, 'from-right', EAST), new ConveyorTile(1, 'from-right', SOUTH)],
      [new ConveyorTile(1, 'from-right', NORTH), new ConveyorTile(1, 'from-right', WEST)],
      [new EmptyTile(), new EmptyTile()],
    ], [{ x: 0 }, { x: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }])
    for (const _robot of robots) game.executeNextAction()
    expect(pass(game).robots).toEqual([])
    expect(pass(game).robots).toEqual([])
    expect(pass(game).robots.map(({ position, direction }) => ({ position, direction }))).toEqual([
      { position: at(1, 1), direction: SOUTH },
      { position: at(1, 2), direction: SOUTH },
      { position: at(0, 2), direction: SOUTH },
      { position: at(0, 1), direction: SOUTH },
    ])
  })
})
