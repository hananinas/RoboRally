import type { Locator } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'

async function expectRobot(robot: Locator, x: number, y: number, angle: number) {
  await expect(robot).toBeVisible()
  await expect(robot).toHaveAttribute('data-board-tile', `${x},${y}`)
  // Check the rendered sprite as well as its tile metadata. The 21×15 board
  // has a 78px tile pitch and is centred on tile (10,7).
  await expect.poll(() => robot.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      x: Number.parseFloat(style.left),
      y: Number.parseFloat(style.top),
      angle: Number.parseFloat(style.getPropertyValue('--board-piece-angle')),
    }
  })).toEqual({ x: (x - 10) * 78, y: (y - 7) * 78, angle })
}

test.use({ reducedMotion: 'reduce' })

test('plays every register of two consecutive programs through the real Game Service', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill('Round player')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: /Lobby 1/ }).click()
  await page.getByRole('button', { name: 'Join game', exact: true }).click()

  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(page.locator('.board-canvas')).toHaveAttribute('data-board-columns', '21')
  await expect(page.locator('.board-canvas')).toHaveAttribute('data-board-rows', '15')
  const robotIds = await page.locator('[data-robot-id]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute('data-robot-id')))])
  expect(robotIds).toHaveLength(1)
  const robot = page.locator(`[data-robot-id="${robotIds[0]}"]`).first()
  await expectRobot(robot, 10, 7, 0)

  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const registered = page.getByRole('button', { name: /remove from register/ })
  const done = page.getByRole('button', { name: 'Done', exact: true })
  await expect(hand).toHaveCount(9)
  for (const card of await hand.all()) await expect(card).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
  await expect(done).toBeDisabled()

  // Pause only browser time; service execution and Socket.IO delivery stay real.
  // Use a relative pause to avoid jumping past the socket heartbeat interval.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const rounds = [
    [
      { card: 'Move 1', x: 10, y: 6, angle: 0 },
      { card: 'Turn Left', x: 10, y: 6, angle: -90 },
      { card: 'Move 2', x: 8, y: 6, angle: -90 },
      { card: 'Turn Left', x: 8, y: 6, angle: -180 },
      { card: 'Move 3', x: 8, y: 9, angle: -180 },
    ],
    [
      { card: 'Turn Left', x: 8, y: 9, angle: -270 },
      { card: 'Move 1', x: 9, y: 9, angle: -270 },
      { card: 'Turn Left', x: 9, y: 9, angle: -360 },
      { card: 'Move 2', x: 9, y: 7, angle: -360 },
      { card: 'Move 3', x: 9, y: 4, angle: -360 },
    ],
  ] as const
  for (const [roundIndex, steps] of rounds.entries()) {
    for (const [index, step] of steps.entries()) {
      // Each round uses both distinct Turn Left cards from the hand.
      await page.getByRole('region', { name: 'Programming hand' })
        .getByRole('button', { name: step.card, exact: true })
        .and(page.locator(':enabled')).first().click()
      await expect(registered.nth(index)).toHaveAccessibleName(`${step.card}, remove from register ${index + 1}`)
    }
    await expect(registered).toHaveCount(5)
    await expect(done).toBeEnabled()
    await done.click()

    for (const [index, step] of steps.entries()) {
      await test.step(`round ${roundIndex + 1}, register ${index + 1}: ${step.card}`, async () => {
        await expectRobot(robot, step.x, step.y, step.angle)
        await expect(page.getByRole('status')).toHaveText('Executing')
        await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
        await expect(registered).toHaveCount(5)
        for (const card of await hand.all()) await expect(card).toBeDisabled()
        for (const card of await registered.all()) await expect(card).toBeDisabled()
        // Reduced motion keeps a 200ms playback slot per register, without
        // exercising the movement/turn animation already covered elsewhere.
        await page.clock.runFor(200)
      })
    }

    await expect(page.getByRole('status')).toHaveText('Programming')
    await expect(registered).toHaveCount(0)
    await expect(hand).toHaveCount(9)
    for (const card of await hand.all()) await expect(card).toBeEnabled()
    await expect(done).toBeDisabled()
    const final = steps[4]
    await expectRobot(robot, final.x, final.y, final.angle)
  }
})
