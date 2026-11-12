import { expect, test } from './real-game-fixture.ts'
import { browse, createLobby, gameStatus, login, robotIds, startTogether } from './browserClient.ts'

test('recovers the existing game after a temporary disconnect', async ({ browser, page, baseURL }) => {
  const contextB = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const pageB = await contextB.newPage()
  try {
    await startTogether(page, pageB, 'bence', 'dane')
    await expect.poll(() => robotIds(page)).toHaveLength(2)
    await pageB.getByRole('region', { name: 'Programming hand' }).getByRole('button', { name: 'Move 1', exact: true }).first().click()
    const selected = pageB.getByRole('button', { name: 'Move 1, remove from register 1', exact: true })
    await expect(selected).toBeEnabled()

    await page.context().setOffline(true)
    await expect(gameStatus(page)).toHaveText('Not connected')
    await expect(gameStatus(pageB)).toHaveText('Game paused · Waiting for bence')
    const overlay = pageB.locator('.disconnect-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay.getByRole('heading')).toHaveText('bence has disconnected')
    await expect(overlay.getByRole('status')).toBeVisible()
    await expect(overlay).toHaveCSS('backdrop-filter', /blur\(/)
    await expect(overlay.getByRole('button', { name: 'Leave game', exact: true })).toBeEnabled()
    await expect(selected).toBeDisabled()
    for (const card of await pageB.getByRole('region', { name: 'Programming hand' }).getByRole('button').all()) {
      await expect(card).toBeDisabled()
    }

    await expect.poll(() => robotIds(pageB)).toHaveLength(2)

    await page.context().setOffline(false)
    await expect(gameStatus(page)).toHaveText('Programming', { timeout: 10000 })
    await expect(gameStatus(pageB)).toHaveText('Programming')
    await expect(overlay).toHaveCount(0)
    await expect(page.locator('.disconnect-overlay')).toHaveCount(0)
    await expect(selected).toBeEnabled()
    await expect(pageB.getByRole('region', { name: 'Programming hand' }).getByRole('button', { name: 'Move 2', exact: true }).first()).toBeEnabled()

    await expect.poll(() => robotIds(page), { timeout: 10000 }).toHaveLength(2)
  } finally {
    await contextB.close()
  }
})

test('rejects a stale recovered connection once a second login has taken over the membership', async ({ browser, page: stalePage, baseURL }) => {
  const witnessContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const newContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const witnessPage = await witnessContext.newPage()
  const newPage = await newContext.newPage()
  try {
    await startTogether(stalePage, witnessPage, 'bence', 'dane')

    await stalePage.context().setOffline(true)
    await expect(gameStatus(witnessPage)).toContainText('paused')

    await login(newPage, 'bence')

    await stalePage.context().setOffline(false)
    await expect.poll(() => stalePage.getByRole('alert').textContent(), { timeout: 10000 })
      .toContain('already participating from another connection')
    await expect(gameStatus(stalePage)).toHaveText('Not connected')

    await expect(gameStatus(newPage)).toHaveText('Programming')
  } finally {
    await witnessContext.close()
    await newContext.close()
  }
})

test('leaves a paused game through the disconnect overlay and returns to lobby selection', async ({ browser, page, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const other = await otherContext.newPage()
  try {
    await startTogether(page, other, 'bence', 'dane')
    await expect.poll(() => robotIds(page)).toHaveLength(2)

    await otherContext.setOffline(true)
    await expect(gameStatus(page)).toHaveText('Game paused · Waiting for dane')
    const overlay = page.locator('.disconnect-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay.getByRole('heading')).toHaveText('dane has disconnected',)
    await overlay.getByRole('button', { name: 'Leave game', exact: true }).click()

    await expect(page.getByRole('list', { name: 'Lobbies' })).toBeVisible()
    await expect(page.getByText('bence', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
    await expect(overlay).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Join game', exact: true })).toBeDisabled()
  } finally {
    await otherContext.close()
  }
})

test('a disconnected waiting owner returns to browsing while the remaining member becomes owner', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const other = await context.newPage()
  try {
    for (const [client, username] of [[page, 'bence'], [other, 'dane']] as const) {
      await browse(client, username)
      if (client === page) await createLobby(client)
      else {
        await client.getByRole('list', { name: 'Lobbies' }).getByRole('button', { disabled: false }).first().click()
        await client.getByRole('button', { name: 'Join game', exact: true }).click()
      }
    }
    await expect(other.getByText('Waiting for the owner to start.', { exact: true })).toBeVisible()
    await page.context().setOffline(true)
    await expect(other.getByRole('button', { name: 'Start', exact: true })).toBeEnabled({ timeout: 10000 })
    await page.context().setOffline(false)
    await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
    await page.getByRole('list', { name: 'Lobbies' }).getByRole('button', { disabled: false }).first().click()
    await page.getByRole('button', { name: 'Join game', exact: true }).click()
    await expect(page.getByText('Waiting for the owner to start.', { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})
