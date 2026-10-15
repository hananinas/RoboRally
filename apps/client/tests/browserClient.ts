import { expect, type Page } from '@playwright/test'

export async function login(page: Page, username: string) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: /Lobby 1/ }).click()
  await page.getByRole('button', { name: 'Join game', exact: true }).click()
  await expect(page.getByRole('main', { name: 'Game board' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button')).toHaveCount(9)
}

export async function robotIds(page: Page): Promise<string[]> {
  return page.locator('[data-robot-id]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute('data-robot-id')!))])
}
