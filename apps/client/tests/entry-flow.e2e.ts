import type { Page } from '@playwright/test'
import { expect, test } from './game-fixture.ts'
import { GAME_ID, PLAYER_ID, ROBOT_ID } from './game-fixture-data.ts'

const username = ' Player 🤖 '

async function logIn(page: Page, value = 'CircuitBreaker') {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(value)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
}

async function joinDefaultLobby(page: Page) {
  await page.getByRole('dialog', { name: 'Choose a lobby' }).getByRole('option', { name: /Foundry Floor/ }).click()
  await page.getByRole('button', { name: 'Join selected lobby' }).click()
}

test('shows named and numbered lobbies after username login without joining the game', async ({ page, game }) => {
  await page.goto('/')

  await expect(page.getByLabel('Username')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveCount(0)
  await page.getByLabel('Username').fill('CircuitBreaker')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Choose a lobby' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create a lobby' })).toBeVisible()
  await expect(dialog.getByRole('option')).toHaveCount(4)
  await expect(dialog.getByRole('option', { name: /Foundry Floor.*Lobby #0421/ })).toBeVisible()
  await expect(dialog.getByRole('option', { name: /Laser Maze.*Lobby #0188/ })).toBeVisible()

  const list = dialog.getByRole('listbox', { name: 'Available lobbies' })
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login'])
})

test('creates a numbered lobby row and joins only after selecting it', async ({ page, game }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Create a lobby' }).click()
  await page.getByLabel('Lobby name').fill('The Workshop')
  const number = await page.getByLabel('Generated lobby number').inputValue()
  expect(number).toMatch(/^\d{4}$/)
  await page.getByRole('button', { name: 'Create lobby', exact: true }).click()

  const picker = page.getByRole('dialog', { name: 'Choose a lobby' })
  const created = picker.getByRole('option', { name: new RegExp(`The Workshop.*Lobby #${number}`) })
  await expect(created).toHaveAttribute('aria-selected', 'true')
  expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login'])

  await picker.getByRole('button', { name: 'Join selected lobby' }).click()
  await expect(page.getByRole('heading', { name: 'CircuitBreaker', exact: true })).toBeVisible()
  expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login', 'game.join'])
})

test('returns to the picker when canceling a local lobby draft', async ({ page }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Create a lobby' }).click()
  await page.getByLabel('Lobby name').fill('Temporary lobby')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  const picker = page.getByRole('dialog', { name: 'Choose a lobby' })
  await expect(picker.getByRole('button', { name: 'Create a lobby' })).toBeVisible()
  await expect(picker.getByLabel('Lobby name')).toHaveCount(0)
})

test('selects an existing numbered lobby before joining the configured game', async ({ page, game }) => {
  await logIn(page)
  const picker = page.getByRole('dialog', { name: 'Choose a lobby' })
  const foundry = picker.getByRole('option', { name: /Foundry Floor.*Lobby #0421/ })
  await foundry.click()
  await expect(foundry).toHaveAttribute('aria-selected', 'true')
  expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login'])
  await picker.getByRole('button', { name: 'Join selected lobby' }).click()
  await expect(page.getByRole('heading', { name: 'CircuitBreaker', exact: true })).toBeVisible()
})

test('does not enable game join until a lobby is selected', async ({ page, game }) => {
  await logIn(page)
  await expect(page.getByRole('button', { name: 'Join selected lobby' })).toBeDisabled()
  expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login'])
})
async function submitUsername(page: Page, value = username, joinLobbyAfterLogin = true) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(value)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  if (joinLobbyAfterLogin) {
    await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
    await joinDefaultLobby(page)
  }
}

test('shows an initial connection error and recovers without losing the username or queuing login', async ({ page, game }) => {
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Username' })
  await input.fill(username)
  await expect(page.getByRole('alert')).toHaveText('Could not connect to the Game Service.')
  await expect(input).toBeEnabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  expect((await game.snapshot()).entryRequests).toEqual([])

  await page.unroute('**/socket.io/**')
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(input).toHaveValue(username)
  expect((await game.snapshot()).entryRequests).toEqual([])

  await input.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
  await joinDefaultLobby(page)
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  const { entryRequests } = await game.snapshot()
  expect(entryRequests).toEqual([
    { event: 'user.login', socketId: expect.any(String), payload: { username } },
    { event: 'game.join', socketId: entryRequests[0].socketId, payload: { gameId: GAME_ID } },
  ])
})

test('starts with username, a UI-only password and login, validating Unicode code points without trimming', async ({ page, game }) => {
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Username' })
  const submit = page.getByRole('button', { name: 'Log in', exact: true })
  await expect(page.locator('input')).toHaveCount(2)
  const password = page.getByLabel('Password', { exact: true })
  await expect(password).toHaveAttribute('type', 'password')
  await password.fill('preview-only')
  await expect(page.getByRole('button')).toHaveCount(1)
  await expect(submit).toBeDisabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  expect((await game.snapshot()).entryRequests).toEqual([])

  await input.fill('🤖'.repeat(31))
  await expect(submit).toBeDisabled()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.fill(' ')
  await expect(submit).toBeEnabled()
  const exactUsername = ` ${'🤖'.repeat(28)} `
  await input.fill(exactUsername)
  await expect(submit).toBeEnabled()
  await input.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
  await joinDefaultLobby(page)
  const heading = page.getByRole('complementary', { name: 'Game controls' }).getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()
  expect(await heading.textContent()).toBe(exactUsername)
  const { entryRequests, stateRequests } = await game.snapshot()
  expect(entryRequests).toEqual([
    { event: 'user.login', socketId: expect.any(String), payload: { username: exactUsername } },
    { event: 'game.join', socketId: entryRequests[0].socketId, payload: { gameId: GAME_ID } },
  ])
  expect(stateRequests).toBe(0)
})

test('waits for login then JOINED on the same socket, blocking duplicate requests and partial game entry', async ({ page, game }) => {
  await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: true })
  await game.control({ type: 'join', outcome: 'JOINED', deferred: true })
  await submitUsername(page, username, false)
  await expect.poll(async () => (await game.snapshot()).pendingLogins).toBe(1)
  await expect(page.getByRole('button', { name: 'Logging in…' })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeDisabled()
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled()
  await page.locator('form').evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit() })
  expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login'])

  await game.control({ type: 'respond-login' })
  await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
  await joinDefaultLobby(page)
  await expect.poll(async () => (await game.snapshot()).pendingJoins).toBe(1)
  await expect(page.getByRole('button', { name: 'Joining game…' })).toBeDisabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)

  await game.control({ type: 'respond-join' })
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveCount(0)
  await expect(page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()).toHaveAttribute('data-board-tile', '5,5')
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand).toHaveCount(9)
  await expect(hand.first()).toBeEnabled()
  const { entryRequests, stateRequests } = await game.snapshot()
  expect(entryRequests.map((request) => request.event)).toEqual(['user.login', 'game.join'])
  expect(entryRequests[1].socketId).toBe(entryRequests[0].socketId)
  expect(stateRequests).toBe(0)
})

test('ignores an early hand until JOINED supplies the authoritative board and hand', async ({ page, game }) => {
  await game.control({ type: 'join', outcome: 'JOINED', deferred: true })
  await submitUsername(page)
  await expect.poll(async () => (await game.snapshot()).pendingJoins).toBe(1)
  await game.control({
    type: 'early-hand',
    cards: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', instruction: 'TURN_LEFT' }],
  })
  await expect(page.getByRole('button', { name: 'Joining game…' })).toBeDisabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
  expect((await game.snapshot()).submissions).toEqual([])

  await game.control({ type: 'respond-join' })
  await expect(page.locator(`[data-robot-id="${ROBOT_ID}"]`).first()).toHaveAttribute('data-board-tile', '5,5')
  const hand = page.getByRole('region', { name: 'Programming hand' }).getByRole('button')
  await expect(hand).toHaveCount(9)
  for (let index = 0; index < 5; index++) await hand.nth(index).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  expect((await game.snapshot()).submissions).toEqual([
    { gameId: GAME_ID, playerId: PLAYER_ID, cardIds: game.initial.cards.slice(0, 5).map((card) => card.id) },
  ])
})

for (const outcome of ['INVALID_USERNAME', 'INVALID_REQUEST', 'INTERNAL_ERROR'] as const) {
  test(`shows login rejection ${outcome} without joining and allows correction`, async ({ page, game }) => {
    await game.control({ type: 'login', outcome, deferred: false })
    await submitUsername(page, username, false)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeEnabled()
    expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(['user.login'])
    await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: false })
    await page.getByRole('textbox', { name: 'Username' }).fill('Corrected')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
  })
}

test('recovers from changing the username after an accepted login times out', async ({ page, game }) => {
  await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: true })
  await page.clock.install()
  await submitUsername(page, 'Alice', false)
  await expect.poll(async () => (await game.snapshot()).pendingLogins).toBe(1)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
  await page.clock.runFor(5000)
  await expect(page.getByRole('alert')).toContainText('did not respond')

  await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: false })
  const input = page.getByRole('textbox', { name: 'Username' })
  await input.fill('Bob')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already logged in with another username')
  await game.control({ type: 'respond-login' })
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeEnabled()
  await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  const before = (await game.snapshot()).entryRequests
  expect(before).toEqual([
    { event: 'user.login', socketId: expect.any(String), payload: { username: 'Alice' } },
    { event: 'user.login', socketId: before[0].socketId, payload: { username: 'Bob' } },
  ])

  // Editing again must not hide the need to reset the server-bound identity.
  await input.fill(username)
  await page.clock.resume()
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
  await expect(input).toHaveValue(username)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect((await game.snapshot()).entryRequests).toEqual(before)
  await input.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
  await joinDefaultLobby(page)
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  const after = (await game.snapshot()).entryRequests.slice(before.length)
  expect(after).toEqual([
    { event: 'user.login', socketId: expect.any(String), payload: { username } },
    { event: 'game.join', socketId: after[0].socketId, payload: { gameId: GAME_ID } },
  ])
  expect(after[0].socketId).not.toBe(before[0].socketId)
  expect(await page.getByRole('complementary', { name: 'Game controls' })
    .getByRole('heading', { level: 1 }).textContent()).toBe(username)
})

test('keeps the login form and error recovery reachable on short screens', async ({ page, game }) => {
  await game.control({ type: 'join', outcome: 'GAME_NOT_FOUND', deferred: false })
  await submitUsername(page)
  await expect(page.getByRole('alert')).toBeVisible()
  const login = page.locator('.login')
  const retry = page.getByRole('button', { name: 'Retry joining' })
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 568, height: 220 },
    { width: 320, height: 220 },
  ]) {
    await page.setViewportSize(viewport)
    await login.evaluate((element) => { element.scrollTop = 0 })
    await expect(page.getByRole('heading', { name: 'RoboRally' })).toBeInViewport({ ratio: 1 })
    if (await login.evaluate((element) => element.scrollHeight > element.clientHeight)) {
      await page.mouse.move(10, 10)
      await page.mouse.wheel(0, 1000)
      await expect.poll(() => login.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    }
    await expect(retry).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 })
    expect(await login.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await game.control({ type: 'join', outcome: 'JOINED', deferred: false })
  await retry.click()
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
})

for (const outcome of ['INVALID_REQUEST', 'GAME_NOT_FOUND', 'NO_SPAWN_AVAILABLE', 'USER_ALREADY_IN_GAME', 'GAME_ALREADY_STARTED', 'INTERNAL_ERROR'] as const) {
  test(`retries join rejection ${outcome} without logging in again`, async ({ page, game }) => {
    await game.control({ type: 'join', outcome, deferred: false })
    await submitUsername(page)
    await expect(page.getByRole('alert')).toBeVisible()
    if (outcome === 'GAME_ALREADY_STARTED') {
      await expect(page.getByRole('alert')).toHaveText(
        'The game has already started and is no longer accepting new players.',
      )
    }
    await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(username)
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Retry joining' })).toBeEnabled()
    expect((await game.snapshot()).entryRequests.map((request) => request.event))
      .toEqual(['user.login', 'game.join'])
    expect((await game.snapshot()).submissions).toEqual([])
    await game.control({ type: 'join', outcome: 'JOINED', deferred: false })
    await page.getByRole('button', { name: 'Retry joining' }).click()
    await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
    const { entryRequests } = await game.snapshot()
    expect(entryRequests.map((request) => request.event)).toEqual(['user.login', 'game.join', 'game.join'])
    expect(new Set(entryRequests.map((request) => request.socketId)).size).toBe(1)
  })
}

test('LOGIN_REQUIRED returns to editable login instead of retrying join', async ({ page, game }) => {
  await game.control({ type: 'join', outcome: 'LOGIN_REQUIRED', deferred: false })
  await submitUsername(page)
  await expect(page.getByRole('alert')).toContainText('Please log in again')
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(username)
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeEnabled()
  await game.control({ type: 'join', outcome: 'JOINED', deferred: false })
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
  await joinDefaultLobby(page)
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  expect((await game.snapshot()).entryRequests.map((request) => request.event))
    .toEqual(['user.login', 'game.join', 'user.login', 'game.join'])
})

for (const stage of ['login', 'join'] as const) {
  test(`${stage} timeout stays on entry, ignores late acknowledgement, and permits manual retry`, async ({ page, game }) => {
    if (stage === 'login') await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: true })
    else await game.control({ type: 'join', outcome: 'JOINED', deferred: true })
    await page.clock.install()
    await submitUsername(page, username, stage !== 'login')
    await expect.poll(async () => (await game.snapshot())[stage === 'login' ? 'pendingLogins' : 'pendingJoins']).toBe(1)
    await game.control({ type: 'early-hand', cards: game.initial.cards })
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
    await page.clock.runFor(5000)
    await expect(page.getByRole('alert')).toContainText('did not respond')
    await game.control({ type: stage === 'login' ? 'respond-login' : 'respond-join' })
    await expect(page.getByRole('alert')).toContainText('did not respond')
    await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
    expect((await game.snapshot()).submissions).toEqual([])
    expect((await game.snapshot()).entryRequests).toHaveLength(stage === 'login' ? 1 : 2)

    if (stage === 'login') await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: false })
    else await game.control({ type: 'join', outcome: 'JOINED', deferred: false })
    await page.getByRole('button', { name: stage === 'login' ? 'Log in' : 'Retry joining', exact: true }).click()
    if (stage === 'login') {
      await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
      await joinDefaultLobby(page)
    }
    await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
    expect((await game.snapshot()).entryRequests.map((request) => request.event)).toEqual(stage === 'login'
      ? ['user.login', 'user.login', 'game.join'] : ['user.login', 'game.join', 'game.join'])
    expect(new Set((await game.snapshot()).entryRequests.map((request) => request.socketId)).size).toBe(1)
  })
}

for (const stage of ['login', 'join'] as const) {
  test(`disconnect during ${stage} preserves username but requires fresh login on a new socket`, async ({ page, game }) => {
    await page.clock.install()
    if (stage === 'login') await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: true })
    if (stage === 'join') await game.control({ type: 'join', outcome: 'JOINED', deferred: true })
    await submitUsername(page, username, stage !== 'login')
    await expect.poll(async () => (await game.snapshot())[stage === 'login' ? 'pendingLogins' : 'pendingJoins']).toBe(1)
    const before = (await game.snapshot()).entryRequests
    await game.control({ type: 'early-hand', cards: game.initial.cards })
    await game.control({ type: 'disconnect' })
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(username)
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeEnabled()
    await expect(page.getByRole('alert')).toContainText('Connection lost')
    // The pending request's timeout must not replace the disconnect guidance.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
    await page.clock.runFor(5000)
    await expect(page.getByRole('alert')).toContainText('Connection lost. Reload')
    await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
    expect((await game.snapshot()).submissions).toEqual([])
    await page.clock.resume()
    await game.control({ type: 'login', outcome: 'LOGGED_IN', deferred: false })
    await game.control({ type: 'join', outcome: 'JOINED', deferred: false })
    await page.getByRole('button', { name: 'Retry connection' }).click()
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
    expect((await game.snapshot()).entryRequests).toEqual(before)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Choose a lobby' })).toBeVisible()
    await joinDefaultLobby(page)
    await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
    const after = (await game.snapshot()).entryRequests.slice(before.length)
    expect(after).toEqual([
      { event: 'user.login', socketId: expect.any(String), payload: { username } },
      { event: 'game.join', socketId: after[0].socketId, payload: { gameId: GAME_ID } },
    ])
    expect(after[0].socketId).not.toBe(before[0].socketId)
  })
}

test('uses JOINED phase and submitted status even with no hand', async ({ page, game }) => {
  await game.control({
    type: 'joined-state', state: { ...game.initial.state, phase: 'EXECUTING' },
    hand: [], programSubmitted: true,
  })
  await submitUsername(page)
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Executing')
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Programming hand' })).toHaveCount(0)
  expect((await game.snapshot()).stateRequests).toBe(0)
})
