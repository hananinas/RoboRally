import { expect, openGame, test } from './game-fixture.ts'
import { GAME_ID, PLAYER_ID, ROUND_ACTIONS } from './game-fixture-data.ts'

test('corrects delivery delay, ignores stale clock replies and waits for server finalization', async ({ page, game }) => {
  await page.clock.install({ time: new Date('2040-01-01T00:00:00Z') })
  await openGame(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const countdown = page.getByRole('timer', { name: 'Programming time remaining' })
  await expect(countdown).toHaveCount(0)
  // Real browsers have fractional timestamps; server timestamps are epoch-sized.
  await page.evaluate(() => {
    const now = performance.now.bind(performance)
    performance.now = () => now() + 0.1234567
  })
  const serverTime = 1_900_000_000_000
  const deadline = serverTime + 30_000
  // The timer event arrives two seconds late. The clock reply takes a further
  // two-second round trip, with its timestamp at the midpoint.
  await game.control({ type: 'clock', serverTime: serverTime + 3000, deferred: true })
  await page.clock.runFor(2000)
  await game.control({ type: 'timer', serverTime, timer: { status: 'RUNNING', deadline } })
  await expect.poll(async () => (await game.snapshot()).pendingClocks).toBe(1)
  await expect(countdown).toHaveText('Time remaining: 30s')
  await page.clock.runFor(2000)
  await game.control({ type: 'respond-clock' })
  await expect(countdown).toHaveText('Time remaining: 26s')

  // Editing and rerendering must not restart the countdown.
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await hand.first().click()
  await page.clock.runFor(1000)
  await expect(countdown).toHaveText('Time remaining: 25s')
  await page.clock.setSystemTime(new Date('2050-01-01T00:00:00Z'))
  await page.clock.runFor(1000)
  await expect(countdown).toHaveText('Time remaining: 24s')

  // Reload samples the clock again and corrects the display using the reply's timestamp.
  await game.control({ type: 'clock', serverTime: serverTime + 27_000, deferred: false })
  await page.reload()
  await expect(countdown).toHaveText('Time remaining: 3s')

  await game.control({ type: 'clock', serverTime: serverTime + 27_000, deferred: true })
  await game.control({ type: 'timer', serverTime, timer: { status: 'RUNNING', deadline } })
  await expect.poll(async () => (await game.snapshot()).pendingClocks).toBe(1)
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
  await expect(hand).toHaveCount(cards.length - 5)
  await expect(hand.and(page.getByRole('button', { disabled: true }))).toHaveCount(cards.length - 5)

  // A reply from the closed round must not replace the next round's estimate.
  await game.control({ type: 'round', actions: [] })
  const nextDeadline = serverTime + 90_000
  await game.control({ type: 'clock', serverTime: serverTime + 60_000, deferred: false })
  await game.control({ type: 'timer', timer: { status: 'RUNNING', deadline: nextDeadline } })
  await expect(countdown).toHaveText('Time remaining: 30s')
  await game.control({ type: 'respond-clock' })
  await page.clock.runFor(1000)
  await expect(countdown).toHaveText('Time remaining: 29s')

  // A failed sample keeps the existing countdown running.
  await game.control({ type: 'clock', serverTime: serverTime + 61_000, deferred: true })
  await game.control({ type: 'timer', timer: { status: 'RUNNING', deadline: nextDeadline } })
  await expect.poll(async () => (await game.snapshot()).pendingClocks).toBe(1)
  await page.clock.runFor(5000)
  await expect(countdown).toHaveText('Time remaining: 24s')
  await game.control({ type: 'respond-clock' })
})


test('shows an estimate after the initial clock timeout and retries the sample', async ({ page, game }) => {
  await page.clock.install()
  await openGame(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const serverTime = 1_900_000_000_000
  await game.control({ type: 'clock', serverTime, deferred: true })
  await game.control({ type: 'timer', serverTime, timer: { status: 'RUNNING', deadline: serverTime + 30_000 } })
  const countdown = page.getByRole('timer')
  await expect(countdown).toHaveText('Time remaining: 30s')
  await page.clock.runFor(4999)
  await game.control({ type: 'clock', serverTime: serverTime + 7000, deferred: true })
  await page.clock.runFor(1)
  await expect(countdown).toHaveText('Time remaining: 25s')
  await expect.poll(async () => (await game.snapshot()).pendingClocks).toBe(2)
  // Deliver both the stale reply and the retry; only the retry corrects the estimate.
  await game.control({ type: 'respond-clock' })
  await expect(countdown).toHaveText('Time remaining: 23s')
})


for (const mode of ['drop', 'save-without-ack'] as const) {
  for (const finalize of [false, true]) {
    test(`reconciles ${mode} register edits after recovery${finalize ? ' with timeout finalization' : ''}`, async ({ page, game }) => {
      await openGame(page)
      // Establish a recovery offset before interrupting the transport.
      await game.control({ type: 'timer', timer: { status: 'IDLE' } })
      await game.control({ type: 'register-delivery', mode })
      await page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first().click()
      await expect.poll(async () => (await game.snapshot()).registerUpdates.length).toBe(1)
      const before = (await game.snapshot()).entryRequests
      const entries = before.filter((entry) => entry.event === 'session.get').length
      await page.context().setOffline(true)
      await expect(page.getByRole('status').filter({ hasText: 'Not connected' })).toBeVisible()
      if (finalize) {
        const cards = game.initial.cards
        await game.control({ type: 'finalized', program: {
          gameId: GAME_ID, playerId: PLAYER_ID, reason: 'TIMEOUT',
          cards: [cards[4], cards[3], cards[2], cards[1], cards[0]],
        } })
        await game.control({ type: 'timer', timer: { status: 'CLOSED' } })
      }
      await page.context().setOffline(false)
      await expect.poll(async () => (await game.snapshot()).entryRequests.filter((entry) => entry.event === 'session.get').length).toBe(entries + 1)
      // Verify that the connection was recovered (a new session.get was sent after recovery)
      const after = (await game.snapshot()).entryRequests
      const newSessionGetEntry = after.at(-1)!
      expect(newSessionGetEntry.event).toBe('session.get')
      const selected = page.locator('.registers').getByRole('button', { name: /remove from register/ })
      await expect(selected).toHaveCount(finalize ? 5 : mode === 'drop' ? 0 : 1)
      if (finalize) await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
    })
  }
}


test('makes the next hand editable immediately when a timer starts during playback', async ({ page, game }) => {
  await page.clock.install()
  await openGame(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  await game.control({ type: 'round', actions: Array.from({ length: 6 }, () => ROUND_ACTIONS).flat() })
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand.first()).toBeDisabled()
  const serverTime = 1_900_000_000_000
  await game.control({ type: 'clock', serverTime, deferred: false })
  await game.control({ type: 'timer', serverTime, timer: { status: 'RUNNING', deadline: serverTime + 30_000 } })
  await expect(hand.first()).toBeEnabled()
  await expect(page.getByRole('timer')).toHaveText('Time remaining: 30s')
  await hand.first().click()
  await expect(page.locator('.registers').getByRole('button', { name: /remove from register/ })).toHaveCount(1)
})
