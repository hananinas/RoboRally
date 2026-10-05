import { expect, test } from './game-fixture.ts'

async function logIn(page: import('@playwright/test').Page, username: string) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  return page.getByRole('dialog', { name: 'Choose a lobby' })
}

test('creates a shared lobby and lets another client join by generated code', async ({ page, game }) => {
  const hostPicker = await logIn(page, 'Host')
  await hostPicker.getByRole('button', { name: 'Create a lobby' }).click()
  await page.getByLabel('Lobby name').fill('Shared Workshop')
  const code = await page.getByLabel('Generated lobby code').inputValue()
  expect(code).toMatch(/^\d{4}$/)
  await page.getByRole('radio', { name: 'Map 2' }).check()
  await page.getByRole('button', { name: 'Create lobby', exact: true }).click()

  const hostWaiting = page.getByRole('dialog', { name: 'Waiting for players' })
  await expect(hostWaiting).toBeVisible()
  await expect(hostWaiting).toContainText('Shared Workshop')
  await expect(hostWaiting).toContainText(code)
  await expect(hostWaiting.getByRole('list').getByText('Host')).toBeVisible()

  const guestPage = await page.context().newPage()
  await guestPage.setExtraHTTPHeaders({ 'x-fixture-id': game.initial.id })
  const guestPicker = await logIn(guestPage, 'Guest')
  const guestRow = guestPicker.getByRole('option', {
    name: new RegExp(`Shared Workshop.*Lobby #${code}.*Map 2`),
  })
  await expect(guestRow).toBeVisible()
  await guestPicker.getByPlaceholder('4-digit code').fill(code)
  await guestPicker.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(guestRow).toHaveAttribute('aria-selected', 'true')
  await guestPicker.getByRole('button', { name: 'Join selected lobby' }).click()
  const guestWaiting = guestPage.getByRole('dialog', { name: 'Waiting for players' })
  await expect(guestWaiting).toBeVisible()
  await expect(guestWaiting.getByRole('list').getByText('Guest')).toBeVisible()
  await expect(hostWaiting.getByRole('list').getByText('Guest')).toBeVisible()
  await expect(guestWaiting.getByRole('status')).toContainText('Game starts in')
  await expect(guestPage.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Host', exact: true })).toBeVisible()
})
