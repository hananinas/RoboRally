import type { Locator, Page } from '@playwright/test'
import { expect, openGame, test } from './game-fixture.ts'
import { GAME_ID, OTHER_ROBOT_ID, PLAYER_ID, ROBOT_ID, type FixtureControl, type FixtureSnapshot } from './game-fixture-data.ts'

const ROUND = [
  {
    gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1',
    position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' }, pushedRobots: [], reboots: [],
  },
  {
    gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 1, robotId: ROBOT_ID, instruction: 'MOVE_2', resolvedInstruction: 'MOVE_2',
    position: { coordinate: { x: 1, y: 9 }, orientation: 'EAST' }, pushedRobots: [],
    reboots: [{ robotId: ROBOT_ID, fellAt: { x: 5, y: 3 }, landedAt: { x: 1, y: 9 } }],
  },
] as const

// MOVE_3 north from (5,5) falls into the pit at (5,3) and reboots on (5,4), a tile it drove over.
const REBOOT_ON_PATH = [{
  gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_3', resolvedInstruction: 'MOVE_3',
  position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' }, pushedRobots: [],
  reboots: [{ robotId: ROBOT_ID, fellAt: { x: 5, y: 3 }, landedAt: { x: 5, y: 4 } }],
}] as const

// Nathan's multiplayer route on this board: MOVE_3 north from (5,5) pushes the other robot
// from (5,4) into the pit at (5,2). It reboots back on (5,4), so pushedRobots leaves it out,
// and then this robot drives in after it and reboots on (1,9).
const PUSH_INTO_PIT = [{
  gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_3', resolvedInstruction: 'MOVE_3',
  position: { coordinate: { x: 1, y: 9 }, orientation: 'NORTH' }, pushedRobots: [],
  reboots: [
    { robotId: OTHER_ROBOT_ID, fellAt: { x: 5, y: 2 }, landedAt: { x: 5, y: 4 } },
    { robotId: ROBOT_ID, fellAt: { x: 5, y: 2 }, landedAt: { x: 1, y: 9 } },
  ],
}] as const

type Game = Readonly<{ initial: FixtureSnapshot; control: (control: FixtureControl) => Promise<FixtureSnapshot> }>

async function openPitBoard(page: Page, game: Game, pit = { x: 5, y: 3 }, otherRobotAt?: { x: number; y: number }) {
  await page.clock.install()
  const state = {
    ...game.initial.state,
    board: {
      ...game.initial.state.board,
      tiles: game.initial.state.board.tiles.map((tile) =>
        tile.position.x === pit.x && tile.position.y === pit.y ? { ...tile, type: 'PIT' as const } : tile),
    },
    robots: game.initial.state.robots.map((robot) => robot.robotId === OTHER_ROBOT_ID && otherRobotAt
      ? { ...robot, position: { ...robot.position, coordinate: otherRobotAt } } : robot),
  }
  await game.control({ type: 'joined-state', state, hand: game.initial.cards, programSubmitted: false })
  await openGame(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
}

// Where the tank is drawn at the start and halfway through what it is currently animating.
function drawnAt(tank: Locator) {
  return tank.evaluate((element) => {
    const animations = element.getAnimations()
    const saved = animations.map((animation) => animation.currentTime)
    const sample = (progress: number) => {
      for (const animation of animations) {
        animation.currentTime = Number(animation.effect?.getComputedTiming().duration ?? 0) * progress
      }
      const { left, top } = getComputedStyle(element)
      return `${left} ${top}`
    }
    const samples = [sample(0), sample(0.5)]
    animations.forEach((animation, index) => { animation.currentTime = saved[index] })
    return samples
  })
}

function opacity(tank: Locator) {
  return tank.evaluate((element) => getComputedStyle(element).opacity)
}

async function expectDriving(tank: Locator) {
  await expect.poll(async () => {
    const [start, midway] = await drawnAt(tank)
    return midway !== start
  }).toBe(true)
}

async function expectStill(tank: Locator) {
  const [start, midway] = await drawnAt(tank)
  expect(midway).toBe(start)
}

test('falls into the pit and respawns in place at the reboot tile', async ({ page, game }) => {
  await openPitBoard(page, game)
  const tank = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hole = page.locator('[data-board-tile-type="hole"][data-board-tile="5,3"]')
  await game.control({ type: 'round', actions: [...ROUND] })

  await expect(tank).toHaveAttribute('data-board-tile', '5,4')
  await expect(tank).not.toHaveAttribute('data-playback-phase')
  await expectDriving(tank)
  await page.clock.runFor(600)

  await expect(tank).toHaveAttribute('data-playback-phase', 'pit-enter')
  await expect(tank).toHaveAttribute('data-board-tile', '5,3')
  await expectDriving(tank)
  await expect(hole).not.toHaveAttribute('data-pit-active')
  await page.clock.runFor(600)

  await expect(tank).toHaveAttribute('data-playback-phase', 'pit-fall')
  await expect(tank).toHaveAttribute('data-board-tile', '5,3')
  await expect(hole).toHaveAttribute('data-pit-active', 'true')
  await expect.poll(() => opacity(tank)).toBe('0')
  await page.clock.runFor(450)

  await expect(tank).toHaveAttribute('data-playback-phase', 'pit-respawn')
  await expect(tank).toHaveAttribute('data-board-tile', '1,9')
  await expect(hole).not.toHaveAttribute('data-pit-active')
  await expectStill(tank)
  await page.clock.runFor(300)

  await expect(tank).not.toHaveAttribute('data-playback-phase')
  await expect(tank).toHaveAttribute('data-board-tile', '1,9')
  await expect.poll(() => opacity(tank)).toBe('1')
  await expect(page.locator('[data-pit-active]')).toHaveCount(0)
})

test('shows the fall when the robot reboots on a tile it drove over', async ({ page, game }) => {
  await openPitBoard(page, game)
  const tank = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hole = page.locator('[data-board-tile-type="hole"][data-board-tile="5,3"]')
  await game.control({ type: 'round', actions: [...REBOOT_ON_PATH] })

  await expect(tank).toHaveAttribute('data-playback-phase', 'pit-enter')
  await expect(tank).toHaveAttribute('data-board-tile', '5,3')
  await expectDriving(tank)
  await page.clock.runFor(600)

  await expect(tank).toHaveAttribute('data-playback-phase', 'pit-fall')
  await expect(hole).toHaveAttribute('data-pit-active', 'true')
  await page.clock.runFor(450)

  await expect(tank).toHaveAttribute('data-playback-phase', 'pit-respawn')
  await expect(tank).toHaveAttribute('data-board-tile', '5,4')
  await page.clock.runFor(300)

  await expect(tank).not.toHaveAttribute('data-playback-phase')
  await expect(tank).toHaveAttribute('data-board-tile', '5,4')
})

test('animates only the robot that is rebooting when a push sends two robots into a pit', async ({ page, game }) => {
  await openPitBoard(page, game, { x: 5, y: 2 }, { x: 5, y: 4 })
  const actor = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const pushed = page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`).first()
  await game.control({ type: 'round', actions: [...PUSH_INTO_PIT] })

  await expect(pushed).toHaveAttribute('data-playback-phase', 'pit-enter')
  await expect(pushed).toHaveAttribute('data-board-tile', '5,2')
  await expect(actor).not.toHaveAttribute('data-playback-phase')
  await expect(actor).toHaveAttribute('data-board-tile', '5,5')
  await page.clock.runFor(600)

  await expect(pushed).toHaveAttribute('data-playback-phase', 'pit-fall')
  await expect(actor).not.toHaveAttribute('data-playback-phase')
  await expect.poll(() => opacity(pushed)).toBe('0')
  expect(await opacity(actor)).toBe('1')
  await page.clock.runFor(450)

  await expect(pushed).toHaveAttribute('data-playback-phase', 'pit-respawn')
  await expect(pushed).toHaveAttribute('data-board-tile', '5,4')
  await page.clock.runFor(300)

  await expect(actor).toHaveAttribute('data-playback-phase', 'pit-enter')
  await expect(actor).toHaveAttribute('data-board-tile', '5,2')
  await expect(pushed).not.toHaveAttribute('data-playback-phase')
  await expect.poll(() => opacity(pushed)).toBe('1')
  await page.clock.runFor(600)

  await expect(actor).toHaveAttribute('data-playback-phase', 'pit-fall')
  await expect(pushed).not.toHaveAttribute('data-playback-phase')
  await page.clock.runFor(450)

  await expect(actor).toHaveAttribute('data-playback-phase', 'pit-respawn')
  await expect(actor).toHaveAttribute('data-board-tile', '1,9')
  await page.clock.runFor(300)

  await expect(actor).not.toHaveAttribute('data-playback-phase')
  await expect(pushed).not.toHaveAttribute('data-playback-phase')
  await expect(pushed).toHaveAttribute('data-board-tile', '5,4')
})

test('skips every pit phase with reduced motion', async ({ page, game }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openPitBoard(page, game)
  const tank = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await game.control({ type: 'round', actions: [...ROUND] })

  await expect(tank).toHaveAttribute('data-board-tile', '5,4')
  await page.clock.runFor(200)
  await expect(tank).toHaveAttribute('data-board-tile', '1,9')
  await expect(tank).not.toHaveAttribute('data-playback-phase')
  await expect(page.locator('[data-pit-active]')).toHaveCount(0)
  await expectStill(tank)
})
