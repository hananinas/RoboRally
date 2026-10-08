import { expect, test } from './real-game-fixture.ts'
import { login, robotIds } from './browserClient.ts'

test('replays a player-joined event missed during a recovered disconnect', async ({ browser, page, baseURL }) => {
  const contextB = await browser.newContext({ baseURL })
  const contextC = await browser.newContext({ baseURL })
  const pageB = await contextB.newPage()
  const pageC = await contextC.newPage()
  try {
    await login(page, 'A')
    await login(pageB, 'B')
    await expect.poll(() => robotIds(page)).toHaveLength(2)

    await page.context().setOffline(true)
    await expect.poll(() => page.getByRole('status').textContent()).toContain('Not connected')
    await expect.poll(() => pageB.getByRole('status').textContent()).toContain('paused')

    await login(pageC, 'C')
    await expect.poll(() => robotIds(pageB)).toHaveLength(3)

    await page.context().setOffline(false)
    await expect.poll(() => page.getByRole('status').textContent(), { timeout: 10000 }).not.toContain('Not connected')

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
    await expect.poll(() => witnessPage.getByRole('status').textContent()).toContain('paused')

    await login(newPage, 'D')

    await stalePage.context().setOffline(false)
    await expect.poll(() => stalePage.getByRole('alert').textContent(), { timeout: 10000 })
      .toContain('already participating from another connection')
    await expect(stalePage.getByRole('status')).toHaveText('Not connected')

    await expect.poll(() => newPage.getByRole('status').textContent()).not.toContain('Not connected')
  } finally {
    await witnessContext.close()
    await newContext.close()
  }
})
