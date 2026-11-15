import { expect, test } from './real-game-fixture.ts'
import { browse, createLobby } from './browserClient.ts'

test.use({ reducedMotion: 'reduce' })

test('plays every register of two consecutive programs through the real Game Service', async ({ page }) => {
  await page.clock.install()
  await browse(page, 'bence')
  await createLobby(page)
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
  await expect(robot).toHaveAttribute('data-board-tile', '8,7')

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

  for (let round = 1; round <= 2; round++) {
    const clicked: string[] = []
    for (let index = 0; index < 5; index++) {
      const card = hand.and(page.locator(':enabled')).first()
      const name = (await card.textContent())?.trim() ?? ''
      clicked.push(name)
      await card.click()
      await expect(registered.nth(index)).toHaveAccessibleName(`${name}, remove from register ${index + 1}`)
    }
    await expect(registered).toHaveCount(5)
    await expect(done).toBeEnabled()
    await done.click()

    for (const [index, name] of clicked.entries()) {
      await test.step(`round ${round}, register ${index + 1}: ${name}`, async () => {
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
  }

  await expect(robot).toBeVisible()
})
