import type { Page } from '@playwright/test'
import { expect, test } from './game-fixture.ts'

async function login(page: Page, username = ' Player 🤖 ') {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

test('login browses real results and creation waits for explicit Start', async ({ page, game }) => {
  await login(page)
  await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeEnabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Create lobby', exact: true }).click()
  await expect(page.getByText('Waiting for players.', { exact: true })).toBeVisible()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  const requests = (await game.snapshot()).entryRequests.map((request) => request.event)
  expect(requests).toContain('lobby.create')
  expect(requests.filter((event) => event === 'user.login')).toHaveLength(1)
})

test('joining requires selection and enters the waiting screen', async ({ page }) => {
  await login(page)
  const join = page.getByRole('button', { name: 'Join game', exact: true })
  await expect(join).toBeDisabled()
  const row = page.getByRole('button', { name: /Lobby 1/ })
  await expect(row.getByRole('img', { name: 'Map 1 preview' })).toBeVisible()
  await expect(row.getByText('Map 1', { exact: true })).toBeVisible()
  await expect(row.getByText('1/6 players', { exact: true })).toBeVisible()
  await expect(row.getByRole('img', { name: 'Unlocked' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Lobby 2/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Lobby 3/ })).toBeDisabled()
  await expect(row).toBeFocused()
  await row.click()
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await expect(join).toBeEnabled()
  await join.click()
  await expect(page.getByRole('button', { name: 'Leave lobby', exact: true })).toBeEnabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Leave lobby', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
})

test('a pending login disables submission and retains the exact username', async ({ page, game }) => {
  await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: true })
  await login(page)
  await expect.poll(async () => (await game.snapshot()).pendingLogins).toBe(1)
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Logging in…', exact: true })).toBeDisabled()
  await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: false })
  await game.control({ type: 'respond-login' })
  await expect(page.getByText(' Player 🤖 ', { exact: true })).toBeVisible()
})

test('a committed start is recovered when its notification and acknowledgement are delayed', async ({ page, game }) => {
  await game.control({ type: 'start', deferred: true })
  await login(page)
  await page.getByRole('button', { name: 'Create lobby', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Leave lobby', exact: true })).toBeDisabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('region', { name: 'Programming hand' }).getByRole('button').first().click()
  await game.control({ type: 'respond-start' })
  await expect(page.getByRole('button', { name: /remove from register 1/ })).toBeVisible()
  expect((await game.snapshot()).entryRequests.filter((request) => request.event === 'user.login')).toHaveLength(1)
})

for (const outcome of ['INVALID_USERNAME', 'INTERNAL_ERROR'] as const) {
  test(`login rejection ${outcome} keeps the username available for retry`, async ({ page, game }) => {
    await game.control({ type: 'login', outcome, deferred: false })
    await login(page, 'Retry player')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue('Retry player')
    await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: false })
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible()
  })
}

test('recovers an initial connection error without losing the username', async ({ page }) => {
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Username' })
  await input.fill('Retry player')
  await expect(page.getByRole('alert')).toHaveText('Could not connect to the Game Service.')
  await page.unroute('**/socket.io/**')
  await page.getByRole('button', { name: 'Retry connection', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
  await expect(input).toHaveValue('Retry player')
})
