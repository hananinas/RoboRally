import { expect, type Page } from '@playwright/test'

// The disconnect spinner also has role="status". Scope gameplay status checks
// to the HUD so they remain unambiguous while the overlay is visible.
export function gameStatus(page: Page) {
  return page.getByRole('complementary', { name: 'Game controls' }).getByRole('status')
}

export async function browse(page: Page, username: string) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create lobby', exact: true })).toBeVisible()
}
export async function login(page: Page, username: string) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  // Returning game members are discovered automatically after login.
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
}
export async function startTogether(owner: Page, other: Page, ownerName = 'A', otherName = 'B') {
  await browse(owner, ownerName)
  await owner.getByRole('button', { name: 'Create lobby', exact: true }).click()
  await browse(other, otherName)
  await other.getByRole('list', { name: 'Lobbies' }).getByRole('button', { disabled: false }).first().click()
  await other.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(other.getByText('Waiting for the owner to start.', { exact: true })).toBeVisible()
  await expect(other.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
  for (const page of [owner, other]) await expect(page.getByRole('main', { name: 'Game board' })).toHaveCount(0)
  await owner.getByRole('button', { name: 'Start', exact: true }).click()
  for (const page of [owner, other]) {
    await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button')).toHaveCount(9)
  }
}
export async function robotIds(page: Page): Promise<string[]> {
  return page.locator('[data-robot-id]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute('data-robot-id')!))])
}
