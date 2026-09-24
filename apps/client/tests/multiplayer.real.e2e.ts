import { expect, test, type Page } from '@playwright/test'

async function enter(page: Page, username: string) {
  await page.clock.install()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button')).toHaveCount(9)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
}

async function program(page: Page) {
  const cards = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  for (let index = 0; index < 5; index++) await cards.nth(index).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

test('two independent clients join, execute every action in two rounds, and remove a disconnected robot', async ({ browser }) => {
  const a = await browser.newContext()
  const b = await browser.newContext()
  const first = await a.newPage()
  const second = await b.newPage()
  try {
    await enter(first, 'Ada')
    const firstId = await first.locator('[data-robot-id]').first().getAttribute('data-robot-id')
    await enter(second, 'Babbage')
    await expect(first.getByLabel('Participants')).toContainText('Ada, Babbage')
    await expect(second.getByLabel('Participants')).toContainText('Ada, Babbage')
    const secondId = await second.locator('[data-board-tile="9,7"][data-robot-id]').first().getAttribute('data-robot-id')
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
    const ids = [firstId!, secondId!]
    // Explicit expected actions include blocking and the round-two priority reversal.
    const rounds: [number, number, string, string][][] = [
      [[0, 0, '10,6', 'NORTH'], [1, 0, '9,6', 'NORTH'],
       [0, 1, '10,6', 'WEST'], [1, 1, '9,6', 'WEST'],
       [0, 2, '10,6', 'WEST'], [1, 2, '8,6', 'WEST'],
       [0, 3, '10,6', 'SOUTH'], [1, 3, '8,6', 'SOUTH'],
       [0, 4, '10,7', 'SOUTH'], [1, 4, '8,7', 'SOUTH']],
      [[0, 0, '10,8', 'SOUTH'], [1, 0, '8,8', 'SOUTH'],
       [0, 1, '10,8', 'EAST'], [1, 1, '8,8', 'EAST'],
       [0, 2, '11,8', 'EAST'], [1, 2, '9,8', 'EAST'],
       [1, 3, '9,8', 'NORTH'], [0, 3, '11,8', 'NORTH'],
       [1, 4, '9,7', 'NORTH'], [0, 4, '11,7', 'NORTH']],
    ]
    for (const actions of rounds) {
      await program(first)
      await expect(first.getByRole('status')).toHaveText('Program accepted · Waiting for other players')
      await expect(second.getByRole('status')).toHaveText('Programming')
      await expect(first.locator('.game')).not.toHaveAttribute('data-active-register')
      await program(second)
      for (const [player, register, tile, direction] of actions) {
        for (const page of [first, second]) {
          await expect(page.locator('.game')).toHaveAttribute('data-active-register', String(register))
          await expect(page.locator('.game')).toHaveAttribute('data-active-robot-id', ids[player])
          const robot = page.locator(`[data-robot-id="${ids[player]}"]`).first()
          await expect(robot).toHaveAttribute('data-board-tile', tile)
          await expect(robot).toHaveAttribute('data-orientation', direction)
          await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeDisabled()
          await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(5)
        }
        const duration = register === 1 || register === 3 ? 300 : 600
        for (const page of [first, second]) await page.clock.runFor(duration)
      }
      for (const page of [first, second]) {
        await expect(page.getByRole('status')).toHaveText('Programming')
        await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
        await expect(page.getByRole('button', { name: /remove from register/ })).toHaveCount(0)
      }
    }
    await first.screenshot({ path: 'test-results/multiplayer-demo.png' })
    await b.close()
    await expect(first.getByLabel('Participants')).not.toContainText('Babbage')
    await expect(first.locator(`[data-robot-id="${secondId}"]`)).toHaveCount(0)
  } finally {
    await a.close()
    await b.close()
  }
})
