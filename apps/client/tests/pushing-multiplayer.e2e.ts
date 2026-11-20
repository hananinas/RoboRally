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

async function expectRobots(page: Page, ids: readonly string[], tiles: readonly string[], angles: readonly number[]) {
  for (const [index, id] of ids.entries()) {
    const robot = page.locator(`[data-robot-id="${id}"]`).first()
    await expect(robot).toHaveAttribute('data-board-tile', tiles[index])
    await expect.poll(() => robot.evaluate((element) => {
      const angle = Number.parseFloat(getComputedStyle(element).getPropertyValue('--board-piece-angle'))
      return (angle % 360 + 360) % 360
    })).toBe(angles[index])
  }
}

const scenarios = [
  { name: 'chain', card: 'Move 1', afterPush: ['2,3', '1,3', '0,3'], final: ['2,3', '1,2', '0,2'] },
  { name: 'blocked', card: 'Move 1', afterPush: ['3,3', '2,3', '1,3'], final: ['3,3', '2,2', '1,2'] },
  { name: 'pit', card: 'Move 2', afterPush: ['1,3', '5,4', '5,5'], final: ['1,3', '5,3', '5,4'] },
  { name: 'edge', card: 'Move 3', afterPush: ['0,3', '5,4', '5,5'], final: ['0,3', '5,3', '5,4'] },
] as const

for (const scenario of scenarios) {
  test.describe(scenario.name, () => {
    test.use({
      reducedMotion: 'reduce',
      gameServiceArgs: [fileURLToPath(new URL('./pushing-server.mjs', import.meta.url)), scenario.name],
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
        for (const client of pages) {
          await expectRobots(client, ids, ['3,3', '2,3', '1,3'], [0, 0, 0])
          await client.clock.pauseAt(await client.evaluate(() => Date.now() + 100))
        }
        await program(pages[0], ['Turn Left', scenario.card, 'Turn Right', 'U-Turn', 'Turn Left'])
        for (const client of pages.slice(1)) {
          await program(client, ['Turn Left', 'U-Turn', 'Turn Right', 'Back Up', 'Turn Left'])
        }
        for (const client of pages) {
          await expectRobots(client, ids, ['3,3', '2,3', '1,3'], [0, 0, 270])
        }

        // The pusher acts last in register two. Advance five programmed actions
        // and register one's laser step; the sixth action must apply the entire push.
        for (let slot = 0; slot < 6; slot++) {
          for (const client of pages) await client.clock.runFor(200)
        }
        for (const client of pages) {
          await expectRobots(client, ids, scenario.afterPush, [270, 90, 90])
          await expect(client.getByRole('status')).toHaveText('Executing')
          await client.clock.resume()
        }
        for (const client of pages) {
          await expect(client.getByRole('status')).toHaveText('Programming')
          await expectRobots(client, ids, scenario.final, [90, 90, 90])
          await expect(client.getByRole('region', { name: 'Programming hand' }).getByRole('button').first()).toBeEnabled()
        }

        await reconnect(page)
        await expectRobots(page, ids, scenario.final, [90, 90, 90])
        await expect(page.getByRole('status')).toHaveText('Programming')
      } finally {
        await Promise.all(contexts.map((context) => context.close()))
      }
    })
  })
}
