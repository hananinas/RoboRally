import { expect, openGame, test } from './game-fixture.ts'
import { ROBOT_ID } from './game-fixture-data.ts'

test('drops robots onto the board, unless reduced motion is preferred', async ({ page }) => {
  await openGame(page)
  const robot = page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()
  await expect(robot).toHaveCSS('animation-name', 'robot-drop')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(robot).toHaveCSS('animation-name', 'none')
})