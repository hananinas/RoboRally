import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'
import { browse, createLobby, reconnect, robotIds } from './browserClient.ts'

async function program(page: Page, cards: readonly string[]) {
  const hand = page.getByRole('region', { name: 'Programming hand' })
  for (const card of cards) {
    await hand.getByRole('button', { name: card, exact: true }).and(page.locator(':enabled')).first().click()
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

async function tileOf(page: Page, id: string) {
  return page.locator(`[data-robot-id="${id}"]`).first().getAttribute('data-board-tile')
}

test.use({
  reducedMotion: 'reduce',
  gameServiceArgs: [fileURLToPath(new URL('./pushing-server.mjs', import.meta.url))],
})

test('keeps three clients synchronized through pushing and a fresh snapshot', async ({ browser, page, baseURL }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL, ignoreHTTPSErrors: true, reducedMotion: 'reduce' })))
  try {
    const pages = [page, ...await Promise.all(contexts.map((context) => context.newPage()))]
    const playerNames = ['bence', 'dane', 'abid']
    for (const [index, client] of pages.entries()) {
      await client.clock.install()
      await browse(client, playerNames[index])
      if (index === 0) await createLobby(client)
      else {
        await client.getByRole('list', { name: 'Lobbies' }).getByRole('button', { disabled: false }).first().click()
        await client.getByRole('button', { name: 'Join game', exact: true }).click()
        await expect(client.getByText('Waiting for the owner to start.', { exact: true })).toBeVisible()
      }
    }
    await expect(page.getByText('3/6 connected', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect.poll(() => robotIds(page)).toHaveLength(3)
    const ids = await robotIds(page)
    for (const client of pages) await client.clock.pauseAt(await client.evaluate(() => Date.now() + 100))

    const initialTiles = ['6,13', '5,13', '4,13']
    for (const client of pages) {
      for (const [index, id] of ids.entries()) {
        await expect(client.locator(`[data-robot-id="${id}"]`).first()).toHaveAttribute('data-board-tile', initialTiles[index])
      }
    }

    // The pusher turns to face west and moves, pushing the other two. Those
    // two submit only turns, so their own cards never move them.
    await program(pages[0], ['Turn Left', 'Move 2', 'Turn Right', 'Turn Right', 'Turn Right'])
    for (const client of pages.slice(1)) {
      await program(client, ['Turn Right', 'Turn Right', 'Turn Right', 'Turn Right', 'Turn Left'])
    }

    for (let action = 0; action < 5; action++) {
      for (const client of pages) await client.clock.runFor(200)
    }
    for (const client of pages) await client.clock.resume()
    for (const client of pages) {
      await expect(client.getByRole('status')).toHaveText('Programming')
    }

    const pushedTile = await tileOf(page, ids[0])
    expect(pushedTile).not.toBe(initialTiles[0])
    for (const client of pages.slice(1)) {
      for (const id of ids) {
        await expect(client.locator(`[data-robot-id="${id}"]`).first()).toHaveAttribute('data-board-tile', (await tileOf(page, id))!)
      }
    }

    await reconnect(page)
    for (const id of ids) {
      await expect(page.locator(`[data-robot-id="${id}"]`).first()).toHaveAttribute('data-board-tile', (await tileOf(pages[1], id))!)
    }
    await expect(page.getByRole('status')).toHaveText('Programming')
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
