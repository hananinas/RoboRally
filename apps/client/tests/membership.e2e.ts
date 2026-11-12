import type { Locator, Page } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'
import { browse, createLobby, gameStatus, reconnect, robotIds, startTogether } from './browserClient.ts'

test('two players wait for owner Start, play a round, and leave for the lobby browser', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, reducedMotion: 'reduce' })
  const other = await context.newPage()
  try {
    await startTogether(page, other, 'bence', 'dane')
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
    await expect.poll(() => robotIds(page)).toHaveLength(1)
    await expect(page.locator('.disconnect-overlay')).toHaveCount(0)
    await createLobby(other)
    await other.getByRole('button', { name: 'Start', exact: true }).click()
    await expect.poll(() => robotIds(other)).toHaveLength(1)
    expect(await robotIds(other)).not.toEqual(await robotIds(page))
  } finally {
    await context.close()
  }
})


async function expectRoster(roster: Locator, names: string[], owner: string, self: string) {
  const players = roster.locator('.waiting-lobby__seat:not(.waiting-lobby__seat--empty)')
  await expect(players.locator('.waiting-lobby__name')).toHaveText(names)
  await expect(roster.getByRole('listitem')).toHaveCount(6)
  await expect(roster.locator('.waiting-lobby__seat--empty')).toHaveCount(6 - names.length)
  await expect(players.filter({ has: roster.page().getByText(owner, { exact: true }) }).getByText('Owner', { exact: true })).toBeVisible()
  await expect(players.filter({ has: roster.page().getByText(self, { exact: true }) }).getByText('You', { exact: true })).toBeVisible()
}

for (const departure of ['leaves', 'disconnects'] as const) {
  test(`the roster updates and the next member becomes owner when the creator ${departure}`, async ({ browser, page, baseURL }) => {
    const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
    const other = await context.newPage()
    try {
      await browse(page, 'bence')
      await createLobby(page)
      const ownerRoster = page.getByRole('list', { name: 'Connected players' })
      await expectRoster(ownerRoster, ['bence'], 'bence', 'bence')
      await expect(page.getByText('1/6 connected', { exact: true })).toBeVisible()
      await browse(other, 'dane')
      await other.getByRole('list', { name: 'Lobbies' }).getByRole('button', { disabled: false }).first().click()
      await other.getByRole('button', { name: 'Join game', exact: true }).click()
      const otherRoster = other.getByRole('list', { name: 'Connected players' })
      await expectRoster(ownerRoster, ['bence', 'dane'], 'bence', 'bence')
      await expectRoster(otherRoster, ['bence', 'dane'], 'bence', 'dane')
      for (const client of [page, other]) await expect(client.getByText('2/6 connected', { exact: true })).toBeVisible()
      await expect(other.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
      await other.getByRole('group', { name: 'Choose a robot' }).getByRole('button', { name: 'Scout robot' }).click()
      await expect(other.getByRole('heading', { name: 'Scout', exact: true })).toBeVisible()
      await expect(ownerRoster.getByRole('img', { name: 'Scout robot' })).toBeVisible()
      if (departure === 'leaves') await page.getByRole('button', { name: 'Leave lobby', exact: true }).click()
      else await page.close()
      await expectRoster(otherRoster, ['dane'], 'dane', 'dane')
      await expect(other.getByText('1/6 connected', { exact: true })).toBeVisible()
      await expect(other.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
      await other.getByRole('button', { name: 'Start', exact: true }).click()
      await expect(other.getByRole('main', { name: 'Game board' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
}

test('robot colours agree between clients and survive a departure followed by a reload', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
  const other = await context.newPage()
  const colours = (client: Page) => client.locator('[data-robot-id]').evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [element.getAttribute('data-robot-id'),
      getComputedStyle(element).getPropertyValue('--tank-colour').trim()])))
  try {
    await startTogether(page, other, 'bence', 'dane')
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
    await reconnect(other)
    expect(await colours(other)).toEqual(remaining)
    await expect(swatch).toHaveCSS('background-color', 'rgb(77, 141, 235)')
  } finally {
    await context.close()
  }
})
