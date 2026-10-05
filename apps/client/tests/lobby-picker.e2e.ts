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

  const hostRow = hostPicker.getByRole('option', {
    name: new RegExp(`Shared Workshop.*Lobby #${code}.*Map 2`),
  })
  await expect(hostRow).toBeVisible()
  await expect(hostRow).toHaveAttribute('aria-selected', 'true')

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
  await expect(guestPage.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible()

  await expect(hostRow).toContainText('2/6 players')
})
