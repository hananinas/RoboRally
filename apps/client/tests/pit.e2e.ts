import type { Locator, Page } from '@playwright/test'
import { expect, openGame, test } from './game-fixture.ts'
import { GAME_ID, ROBOT_ID, type FixtureControl, type FixtureSnapshot } from './game-fixture-data.ts'

const ROUND = [
  {
    gameId: GAME_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_1',
    position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' }, pushedRobots: [],
  },
  {
    gameId: GAME_ID, registerIndex: 1, robotId: ROBOT_ID, instruction: 'MOVE_2',
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

function motion(tank: Locator) {
  return tank.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      transitioning: element.getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.transitionProperty)
        .sort(),
      placed: style.left === (element as SVGElement).style.left && style.top === (element as SVGElement).style.top,
    }
  })
}

test('falls into the pit and respawns in place at the reboot tile', async ({ page, game }) => {
  await openPitBoard(page, game)
  const tank = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const hole = page.locator('[data-board-tile-type="hole"][data-board-tile="5,3"]')
  await game.control({ type: 'round', actions: [...ROUND] })

  await expect(tank).toHaveAttribute('data-board-tile', '5,4')
  await expect(tank).not.toHaveAttribute('data-pit-phase')
  expect((await motion(tank)).transitioning).toContain('top')
  await page.clock.runFor(600)

  await expect(tank).toHaveAttribute('data-pit-phase', 'move')
  await expect(tank).toHaveAttribute('data-board-tile', '5,3')
  expect((await motion(tank)).transitioning).toContain('top')
  await expect(hole).not.toHaveAttribute('data-pit-active')
  await page.clock.runFor(600)

  await expect(tank).toHaveAttribute('data-pit-phase', 'fall')
  await expect(hole).toHaveAttribute('data-pit-active', 'true')
  await expect.poll(() => tank.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await page.clock.runFor(450)

  await expect(tank).toHaveAttribute('data-pit-phase', 'respawn')
  await expect(tank).toHaveAttribute('data-board-tile', '1,9')
  await expect(hole).not.toHaveAttribute('data-pit-active')
  expect(await motion(tank)).toEqual({ transitioning: ['opacity', 'scale'], placed: true })
  await page.clock.runFor(300)

  await expect(tank).not.toHaveAttribute('data-pit-phase')
  await expect(tank).toHaveAttribute('data-board-tile', '1,9')
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
  await expect(tank).not.toHaveAttribute('data-pit-phase')
  await expect(page.locator('[data-pit-active]')).toHaveCount(0)
  expect((await motion(tank)).placed).toBe(true)
})
