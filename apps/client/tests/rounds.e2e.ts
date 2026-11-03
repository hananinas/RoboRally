import type { Locator } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'
import { browse } from './browserClient.ts'

async function expectRobot(
  robot: Locator,
  x: number,
  y: number,
  angle: number,
  columns: number,
  rows: number,
) {
  await expect(robot).toBeVisible()
  await expect(robot).toHaveAttribute('data-board-tile', `${x},${y}`)
  await expect.poll(() => robot.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      x: Number.parseFloat(style.left),
      y: Number.parseFloat(style.top),
      angle: Number.parseFloat(style.getPropertyValue('--board-piece-angle')),
    }
  })).toEqual({
    x: (x - (columns - 1) / 2) * 78,
    y: (y - (rows - 1) / 2) * 78,
    angle,
  })
}

test.use({ reducedMotion: 'reduce' })

test('plays every register of two consecutive programs through the real Game Service', async ({ page }) => {
  await page.clock.install()
  await browse(page, 'bence')
  await page.getByRole('button', { name: 'Create lobby', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')).toContainText('0/2')
  for (const [number, position] of [[1, '10,6'], [2, '8,9']] as const) {
    const checkpoint = page.getByRole('img', { name: `Checkpoint ${number}`, exact: true })
    await expect(checkpoint).toBeVisible()
    await expect(checkpoint).toHaveAttribute('data-board-tile', position)
    await expect(checkpoint.locator('text')).toHaveText(String(number))
    await expect(page.locator(`[data-board-checkpoint-slice="${number}"]`)).toHaveCount(11)
  }
  await expect(page.locator('.board-canvas')).toHaveAttribute('data-board-columns', '16')
  await expect(page.locator('.board-canvas')).toHaveAttribute('data-board-rows', '15')
  const robotIds = await page.locator('[data-robot-id]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute('data-robot-id')))])
  expect(robotIds).toHaveLength(1)
  const robot = page.locator(`[data-robot-id="${robotIds[0]}"]`).first()
  await expectRobot(robot, 8, 7, 0, 16, 15)

  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  const registered = page.getByRole('button', { name: /remove from register/ })
  const done = page.getByRole('button', { name: 'Done', exact: true })
  await expect(hand).toHaveCount(9)
  for (const card of await hand.all()) await expect(card).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Programming')
  await expect(done).toBeDisabled()

  // Pause only browser time; service execution and Socket.IO delivery stay real.
  // Keep the initial jump below the real service's one-second heartbeat so
  // advancing playback does not immediately expire the socket's ping timer.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
  const rounds = [
    [
      { card: 'Turn Right', x: 8, y: 7, angle: 90 },
      { card: 'Move 2', x: 10, y: 7, angle: 90 },
      { card: 'Turn Left', x: 10, y: 7, angle: 0 },
      { card: 'Move 1', x: 10, y: 6, angle: 0 },
      { card: 'U-Turn', x: 10, y: 6, angle: -180 },
    ],
    [
      { card: 'Turn Right', x: 10, y: 6, angle: -90 },
      { card: 'Move 2', x: 8, y: 6, angle: -90 },
      { card: 'Turn Left', x: 8, y: 6, angle: -180 },
      { card: 'Move 1', x: 8, y: 7, angle: -180 },
      { card: 'Turn Left', x: 8, y: 7, angle: -270 },
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
        await expectRobot(robot, step.x, step.y, step.angle, 16, 15)
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
    await expect(page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..'))
      .toContainText('1/2')
    await expect(page.locator('[data-board-checkpoint]')).toHaveCount(2)
    await expect(registered).toHaveCount(0)
    await expect(hand).toHaveCount(9)
    for (const card of await hand.all()) await expect(card).toBeEnabled()
    await expect(done).toBeDisabled()
    const final = steps[4]
    await expectRobot(robot, final.x, final.y, final.angle, 16, 15)
  }
})
