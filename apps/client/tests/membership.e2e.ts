import type { Page } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'
import { login, robotIds } from './browserClient.ts'

async function leave(page: Page) {
  await page.getByRole('button', { name: 'Game options', exact: true }).click()
  await page.getByRole('button', { name: 'Leave game', exact: true }).click()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Join game', exact: true })).toBeEnabled()
}

test('two real clients see joins and leaves without losing the first player’s selected cards', async ({ browser, page, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL })
  const other = await otherContext.newPage()
  try {
    await login(page, 'First')
    const [firstRobot] = await robotIds(page)
    await expect(page.locator(`[data-robot-id="${firstRobot}"]`).first()).toHaveAttribute('data-board-tile', '10,7')
    await page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first().click()
    const selected = page.getByRole('button', { name: 'Move 1, remove from register 1', exact: true })
    await expect(selected).toBeVisible()

    await login(other, 'Second')
    await expect.poll(() => robotIds(page)).toHaveLength(2)
    expect(await robotIds(other)).toEqual(await robotIds(page))
    const secondRobot = (await robotIds(other)).find((id) => id !== firstRobot)!
    await expect(page.locator(`[data-robot-id="${secondRobot}"]`).first()).toHaveAttribute('data-board-tile', '9,7')
    await expect(selected).toBeVisible()

    await leave(other)
    await expect(other.getByText('Second', { exact: true })).toBeVisible()
    await expect(other.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
    await expect.poll(() => robotIds(page)).toEqual([firstRobot])
    await expect(selected).toBeVisible()

    await other.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(other.getByRole('main', { name: 'Game board' })).toBeVisible()
    await expect.poll(() => robotIds(page)).toHaveLength(2)
    const replacementRobot = (await robotIds(other)).find((id) => id !== firstRobot)!
    expect(replacementRobot).not.toBe(secondRobot)
    await expect(page.locator(`[data-robot-id="${replacementRobot}"]`).first()).toHaveAttribute('data-board-tile', '9,7')
    await expect(selected).toBeVisible()
    await leave(other)
    await leave(page)
  } finally {
    await otherContext.close()
  }
})
