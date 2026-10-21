import { expect, test } from './real-game-fixture.ts'
import { browse, gameStatus, robotIds, startTogether } from './browserClient.ts'

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
    await other.getByRole('list', { name: 'Lobbies' }).getByRole('button').first().click()
    await other.getByRole('button', { name: 'Join game', exact: true }).click()
    await page.getByRole('button', { name: 'Leave lobby', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
    await other.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(other.getByRole('main', { name: 'Game board' })).toBeVisible()
  } finally {
    await context.close()
  }
})
