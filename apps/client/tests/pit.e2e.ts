import type { Locator, Page } from '@playwright/test'
import { expect, openGame, test } from './game-fixture.ts'
import { GAME_ID, PLAYER_ID, ROBOT_ID, type FixtureControl, type FixtureSnapshot } from './game-fixture-data.ts'

const ROUND = [
  {
    gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_1',
    position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' }, pushedRobots: [],
  },
  {
    gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 1, robotId: ROBOT_ID, instruction: 'MOVE_2',
    position: { coordinate: { x: 1, y: 9 }, orientation: 'EAST' }, pushedRobots: [],
  },
] as const

type Game = Readonly<{ initial: FixtureSnapshot; control: (control: FixtureControl) => Promise<FixtureSnapshot> }>

async function openPitBoard(page: Page, game: Game) {
  await page.clock.install()
  const state = {
    ...game.initial.state,
    board: {
      ...game.initial.state.board,
      tiles: game.initial.state.board.tiles.map((tile) =>
        tile.position.x === 5 && tile.position.y === 3 ? { ...tile, type: 'PIT' as const } : tile),
    },
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
  const [start, midway] = await drawnAt(tank)
  expect(midway).not.toBe(start)
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
