import { expect, test } from '@playwright/test'
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
