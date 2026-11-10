import type { Page } from '@playwright/test'
import { expect, openGame, test } from './game-fixture.ts'
import { GAME_ID, PLAYER_ID } from './game-fixture-data.ts'

async function openWithPausedClock(page: Page) {
  await page.clock.install({ time: new Date('2040-01-01T00:00:00Z') })
  await openGame(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
}

test('counts down despite clock skew and wall-clock changes, then waits for server finalization', async ({ page, game }) => {
  await openWithPausedClock(page)
  const countdown = page.getByRole('timer', { name: 'Programming time remaining' })
  await expect(countdown).toHaveCount(0)
  // Real browsers have fractional timestamps; server timestamps are epoch-sized.
  await page.evaluate(() => {
    const now = performance.now.bind(performance)
    performance.now = () => now() + 0.1234567
  })
  const serverTime = 1_900_000_000_000
  const deadline = serverTime + 30_000
  await game.control({ type: 'timer', serverTime, timer: { status: 'RUNNING', deadline } })
  await expect(countdown).toHaveText('Time remaining: 30s')
  await page.clock.runFor(4000)
  await expect(countdown).toHaveText('Time remaining: 26s')

  // Editing and rerendering must not restart the countdown.
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await hand.first().click()
  await page.clock.runFor(1000)
  await expect(countdown).toHaveText('Time remaining: 25s')
  await page.clock.setSystemTime(new Date('2050-01-01T00:00:00Z'))
  await page.clock.runFor(1000)
  await expect(countdown).toHaveText('Time remaining: 24s')

  // A fresh server timestamp corrects the display without changing the deadline.
  await game.control({ type: 'timer', serverTime: serverTime + 27_000, timer: { status: 'RUNNING', deadline } })
  await expect(countdown).toHaveText('Time remaining: 3s')
  await page.clock.runFor(4000)
  await expect(countdown).toHaveText('Time remaining: 0s')
  await expect(hand.nth(1)).toBeEnabled()
  expect((await game.snapshot()).submissions).toEqual([])

  const cards = game.initial.cards
  await game.control({ type: 'finalized', program: {
    gameId: GAME_ID, playerId: PLAYER_ID, reason: 'TIMEOUT',
    cards: [cards[0], cards[1], cards[2], cards[3], cards[4]],
  } })
  await game.control({ type: 'timer', timer: { status: 'CLOSED' } })
  await expect(countdown).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await expect(hand.nth(5)).toBeDisabled()
})
