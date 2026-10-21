import type { Page } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'
import { browse, gameStatus, login, robotIds, startTogether } from './browserClient.ts'

test('two players wait for owner Start, play a round, and leave for the lobby browser', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  const other = await context.newPage()
  try {
    await startTogether(page, other, 'First', 'Second')
    expect(await robotIds(page)).toHaveLength(2)
    expect(await robotIds(other)).toEqual(await robotIds(page))
    for (const client of [page, other]) {
      const hand = client.getByRole('region', { name: 'Programming hand' }).getByRole('button')
      for (let index = 0; index < 5; index++) await hand.nth(index).click()
      await client.getByRole('button', { name: 'Done', exact: true }).click()
    }
    for (const client of [page, other]) {
      await expect(client.getByRole('button', { name: /remove from register/ })).toHaveCount(0, { timeout: 15000 })
      await expect(gameStatus(client)).toHaveText('Programming')
    }
    await other.getByRole('button', { name: 'Game options', exact: true }).click()
    await other.getByRole('button', { name: 'Leave game', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible()
    await expect(other.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
    await expect.poll(() => robotIds(page)).toHaveLength(1)
    await expect(page.locator('.disconnect-overlay')).toHaveCount(0)
    await other.getByRole('button', { name: 'Create lobby', exact: true }).click()
    await other.getByRole('button', { name: 'Start', exact: true }).click()
    await expect.poll(() => robotIds(other)).toHaveLength(1)
    expect(await robotIds(other)).not.toEqual(await robotIds(page))
  } finally {
    await context.close()
  }
})

test('the next member becomes owner when the creator leaves a waiting lobby', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL })
  const other = await context.newPage()
  try {
    await browse(page, 'Owner')
    await page.getByRole('button', { name: 'Create lobby', exact: true }).click()
    await browse(other, 'Other')
    await other.getByRole('list', { name: 'Lobbies' }).getByRole('button', { disabled: false }).first().click()
    await other.getByRole('button', { name: 'Join game', exact: true }).click()
    await page.getByRole('button', { name: 'Leave lobby', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
    await other.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(other.getByRole('main', { name: 'Game board' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('robot colours agree between clients and survive a departure followed by a reload', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL })
  const other = await context.newPage()
  const colours = (client: Page) => client.locator('[data-robot-id]').evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [element.getAttribute('data-robot-id'),
      getComputedStyle(element).getPropertyValue('--tank-colour').trim()])))
  try {
    await startTogether(page, other, 'First', 'Second')
    const initial = await colours(other)
    expect(new Set(Object.values(initial)).size).toBe(2)
    expect(await colours(page)).toEqual(initial)
    const swatch = other.getByRole('img', { name: 'Robot colour', exact: true })
    await expect(swatch).toHaveCSS('background-color', 'rgb(77, 141, 235)')
    await page.getByRole('button', { name: 'Game options', exact: true }).click()
    await page.getByRole('button', { name: 'Leave game', exact: true }).click()
    await expect.poll(() => robotIds(other)).toHaveLength(1)
    const remaining = await colours(other)
    for (const [robotId, colour] of Object.entries(remaining)) expect(colour).toBe(initial[robotId])
    await login(other, 'Second')
    expect(await colours(other)).toEqual(remaining)
    await expect(swatch).toHaveCSS('background-color', 'rgb(77, 141, 235)')
  } finally {
    await context.close()
  }
})
