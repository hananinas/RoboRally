import { expect, test } from './real-game-fixture.ts'
import { gameStatus, login, robotIds } from './browserClient.ts'

test('replays a player-joined event missed during a recovered disconnect', async ({ browser, page, baseURL }) => {
  const contextB = await browser.newContext({ baseURL })
  const contextC = await browser.newContext({ baseURL })
  const pageB = await contextB.newPage()
  const pageC = await contextC.newPage()
  try {
    await login(page, 'A')
    await login(pageB, 'B')
    await expect.poll(() => robotIds(page)).toHaveLength(2)
    await pageB.getByRole('region', { name: 'Programming hand' }).getByRole('button').first().click()
    const selected = pageB.getByRole('button', { name: 'Move 1, remove from register 1', exact: true })
    await expect(selected).toBeEnabled()

    await page.context().setOffline(true)
    await expect(gameStatus(page)).toHaveText('Not connected')
    await expect(gameStatus(pageB)).toHaveText('Game paused · Waiting for A')
    const overlay = pageB.locator('.disconnect-overlay')
    await expect(overlay.getByRole('heading', { name: 'A player has disconnected' })).toBeVisible()
    await expect(overlay.getByRole('status')).toBeVisible()
    await expect(overlay).toHaveCSS('backdrop-filter', /blur\(/)
    await expect(overlay.getByRole('button', { name: 'Leave game', exact: true })).toBeEnabled()
    await expect(selected).toBeDisabled()
    for (const card of await pageB.getByRole('region', { name: 'Programming hand' }).getByRole('button').all()) {
      await expect(card).toBeDisabled()
    }

    await login(pageC, 'C')
    await expect.poll(() => robotIds(pageB)).toHaveLength(3)

    await page.context().setOffline(false)
    await expect(gameStatus(page)).toHaveText('Programming', { timeout: 10000 })
    await expect(gameStatus(pageB)).toHaveText('Programming')
    await expect(overlay).toHaveCount(0)
    await expect(pageC.locator('.disconnect-overlay')).toHaveCount(0)
    await expect(selected).toBeEnabled()
    await expect(pageB.getByRole('region', { name: 'Programming hand' }).getByRole('button', { name: 'Move 2', exact: true })).toBeEnabled()

    await expect.poll(() => robotIds(page), { timeout: 10000 }).toHaveLength(3)
  } finally {
    await contextB.close()
    await contextC.close()
  }
})

test('rejects a stale recovered connection once a second login has taken over the membership', async ({ browser, page: stalePage, baseURL }) => {
  const witnessContext = await browser.newContext({ baseURL })
  const newContext = await browser.newContext({ baseURL })
  const witnessPage = await witnessContext.newPage()
  const newPage = await newContext.newPage()
  try {
    await login(stalePage, 'D')
    await login(witnessPage, 'E')

    await stalePage.context().setOffline(true)
    await expect(gameStatus(witnessPage)).toContainText('paused')

    await login(newPage, 'D')

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
  const otherContext = await browser.newContext({ baseURL })
  const other = await otherContext.newPage()
  try {
    await login(page, 'Staying player')
    await login(other, 'Disconnected player')
    await expect.poll(() => robotIds(page)).toHaveLength(2)

    await otherContext.setOffline(true)
    await expect(gameStatus(page)).toHaveText('Game paused · Waiting for Disconnected player')
    const overlay = page.locator('.disconnect-overlay')
    await expect(overlay.getByRole('heading', { name: 'A player has disconnected' })).toBeVisible()
    await overlay.getByRole('button', { name: 'Leave game', exact: true }).click()

    await expect(page.getByRole('list', { name: 'Lobbies' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Lobby 1/ })).toBeEnabled()
    await expect(page.getByText('Staying player', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
    await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
    await expect(overlay).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Join game', exact: true })).toBeDisabled()
  } finally {
    await otherContext.close()
  }
})
