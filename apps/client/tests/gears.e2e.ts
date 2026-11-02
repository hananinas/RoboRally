import type { EnvironmentStepResolved, PublicGameState } from '@robo-rally/game-events'
import { expect, openGame, pauseClock, test, type GameFixture } from './game-fixture.ts'
import { GAME_ID, OTHER_ROBOT_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'

function setGearState(game: GameFixture) {
  const state: PublicGameState = {
    ...game.initial.state,
    board: { ...game.initial.state.board, tiles: game.initial.state.board.tiles.map((tile) => {
      if (tile.position.x === 5 && tile.position.y === 4) return { ...tile, type: 'GEAR', rotation: 'CLOCKWISE', walls: ['WEST'] }
      if (tile.position.x === 7 && tile.position.y === 5) return { ...tile, type: 'GEAR', rotation: 'COUNTERCLOCKWISE' }
      return tile
    }) },
  }
  return game.control({ type: 'joined-state', state, hand: game.initial.cards, programSubmitted: false })
}

test('renders both gear directions and restores them after reloading', async ({ page, game }) => {
  await setGearState(game)
  await openGame(page)
  const green = page.getByRole('img', { name: 'Green gear: turn right', exact: true })
  const red = page.getByRole('img', { name: 'Red gear: turn left', exact: true })
  await expect(green).toBeVisible()
  await expect(red).toBeVisible()
  await expect(green).toHaveAttribute('data-board-tile', '5,4')
  await expect(red).toHaveAttribute('data-board-tile', '7,5')
  await expect(green).toHaveCSS('color', 'rgb(76, 175, 112)')
  await expect(red).toHaveCSS('color', 'rgb(199, 79, 79)')
  await expect(green.locator('use')).toHaveAttribute('href', '#gearClockwise')
  await expect(red.locator('use')).toHaveAttribute('href', '#gearCounterclockwise')
  await expect(page.locator('[data-board-tile="5,4"][data-board-wall="west"]')).toHaveCount(8)
  for (const gear of [green, red]) {
    expect(await gear.evaluate((element) => {
      const svg = element as SVGSVGElement
      const symbol = document.querySelector(svg.querySelector('use')!.getAttribute('href')!)
      return { symbolExists: symbol !== null, width: getComputedStyle(svg).width, viewBox: svg.getAttribute('viewBox') }
    })).toEqual({ symbolExists: true, width: '84px', viewBox: '0 0 84 84' })
  }
  await page.screenshot({
    path: test.info().outputPath('gears.png'),
    style: '.board-piece--test-tank { visibility: hidden; }',
  })
  await page.reload()
  await expect(green).toBeVisible()
  await expect(red).toBeVisible()
})

test('plays simultaneous gear turns in place between a card and the next hand', async ({ page, game }) => {
  await page.clock.install()
  await setGearState(game)
  await openGame(page)
  await pauseClock(page)
  const move = ROUND_ACTIONS[0]
  const gear: EnvironmentStepResolved = {
    gameId: GAME_ID, roundNumber: 1, registerIndex: 0, stepIndex: 0, kind: 'GEARS', sequence: 1,
    robots: [
      { robotId: ROBOT_ID, position: { coordinate: { x: 5, y: 4 }, orientation: 'EAST' } },
      { robotId: OTHER_ROBOT_ID, position: { coordinate: { x: 7, y: 5 }, orientation: 'WEST' } },
    ], checkpointProgress: [],
  }
  const checkpoint = { ...gear, stepIndex: 1, kind: 'CHECKPOINTS' as const, sequence: 2, robots: [] }
  await game.control({ type: 'round', actions: [move, gear, checkpoint] })
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  const other = page.locator(`[data-robot-id="${OTHER_ROBOT_ID}"]`).first()
  const angle = (element: typeof robot) => element.evaluate((node) => node.style.getPropertyValue('--board-piece-angle'))
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')
  expect(await angle(robot)).toBe('0deg')
  expect(await angle(other)).toBe('0deg')
  await page.clock.runFor(600)
  expect(await angle(robot)).toBe('90deg')
  expect(await angle(other)).toBe('-90deg')
  await expect(robot).toHaveAttribute('data-board-tile', '5,4')
  await expect(other).toHaveAttribute('data-board-tile', '7,5')
  await expect(page.locator('.register[data-active]')).toHaveCount(0)
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(600)
  await expect(hand.last()).toBeDisabled()
  await page.clock.runFor(1)
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
  await page.reload()
  expect(await angle(robot)).toBe('90deg')
  expect(await angle(other)).toBe('-90deg')
})
