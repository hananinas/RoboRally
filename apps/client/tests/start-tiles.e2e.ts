import type { Page } from '@playwright/test'
import { expect, openGame, test } from './game-fixture.ts'
import { OTHER_ROBOT_ID, ROBOT_ID, ROUND_ACTIONS } from './game-fixture-data.ts'

const startTile = (page: Page, robotId: string) => page.locator(`[data-board-start-tile="${robotId}"]`)

test('marks each robot\'s starting tile in the robot\'s colour', async ({ page }) => {
  await openGame(page)

  for (const [robotId, tile, colour] of [
    [ROBOT_ID, '5,5', 'rgb(199, 79, 79)'],
    [OTHER_ROBOT_ID, '7,5', 'rgb(77, 141, 235)'],
  ] as const) {
    await expect(startTile(page, robotId)).toHaveAttribute('data-board-tile', tile)
    await expect(startTile(page, robotId)).toHaveCSS('background-color', colour)
    await expect(startTile(page, robotId)).toHaveCSS('opacity', '1')
  }
})
test('drops robots onto their starting tiles, unless reduced motion is preferred', async ({ page }) => {
  await openGame(page)
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await expect(robot).toHaveCSS('animation-name', 'robot-drop')
  await expect(startTile(page, ROBOT_ID)).toHaveCSS('animation-name', 'start-tile-light-up')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(robot).toHaveCSS('animation-name', 'none')
  await expect(startTile(page, ROBOT_ID)).toHaveCSS('animation-name', 'none')
})

test('keeps the starting tile marked after the robot drives away', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await openGame(page)
  const cards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(cards.first()).toBeEnabled()
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  for (const index of [0, 1, 2, 3, 4]) await cards.nth(index).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await game.control({ type: 'round', actions: ROUND_ACTIONS })
  await game.control({ type: 'deal' })
  for (const action of ROUND_ACTIONS) {
    await expect(page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()).toHaveAttribute(
      'data-board-tile', `${action.position.coordinate.x},${action.position.coordinate.y}`,
    )
    await page.clock.runFor(action.instruction === 'TURN_LEFT' ? 300 : 600)
  }

  await expect(startTile(page, ROBOT_ID)).toHaveAttribute('data-board-tile', '5,5')
})