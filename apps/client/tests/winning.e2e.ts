import type { Page } from '@playwright/test'
import { expect, test } from './real-game-fixture.ts'
import { gameStatus, robotIds, startTogether } from './browserClient.ts'

test.use({ reducedMotion: 'reduce' })

async function program(page: Page, cards: readonly string[]) {
  const hand = page.getByRole('region', { name: 'Programming hand' })
  for (const card of cards) {
    await hand.getByRole('button', { name: card, exact: true }).and(page.locator(':enabled')).first().click()
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

test('announces the winner to every player and lets them leave', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' })
  const other = await context.newPage()
  try {
    await startTogether(page, other, 'Winner', 'Other')
    // The owner's robot starts at (8, 7) and reaches checkpoint 1 at (10, 6) in round 1
    // and the final checkpoint at (8, 9) in register 4 of round 2.
    // The other robot only turns and backs away, so it never blocks that route.
    const rounds = [
      ['Turn Right', 'Move 2', 'Turn Left', 'Move 1', 'U-Turn'],
      ['Turn Right', 'Move 2', 'Turn Left', 'Move 3', 'Turn Left'],
    ] as const
    const otherProgram = ['Turn Left', 'Turn Right', 'U-Turn', 'Turn Left', 'Back Up'] as const

    await program(page, rounds[0])
    await program(other, otherProgram)
    for (const client of [page, other]) {
      await expect(gameStatus(client)).toHaveText('Programming', { timeout: 15000 })
    }

    await program(page, rounds[1])
    await program(other, otherProgram)
    for (const [client, heading] of [[page, 'You win!'], [other, 'Winner wins!']] as const) {
      const dialog = client.getByRole('dialog', { name: 'Game over' })
      await expect(dialog.getByRole('heading')).toHaveText(heading, { timeout: 15000 })
      await expect(gameStatus(client)).toHaveText('Game over')
      for (const card of await client.getByRole('region', { name: 'Programming hand' }).getByRole('button').all()) {
        await expect(card).toBeDisabled()
      }
    }
    await expect(page.getByRole('heading', { name: 'Checkpoints', exact: true }).locator('..')).toContainText('2/2')

    // The winner leaves first; the other player must still see who won.
    await page.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Leave game', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible()
    await expect.poll(() => robotIds(other)).toHaveLength(1)
    await expect(other.getByRole('dialog', { name: 'Game over' }).getByRole('heading')).toHaveText('Winner wins!')
    await other.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Leave game', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})