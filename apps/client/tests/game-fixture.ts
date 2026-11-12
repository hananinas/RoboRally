import { expect, test as base, type Page } from '@playwright/test'
import {
  GAME_SERVICE_URL,
  type FixtureControl,
  type FixtureSnapshot,
} from './game-fixture-data.ts'
import { createLobby } from './browserClient.ts'

type GameFixture = {
  initial: FixtureSnapshot
  snapshot: () => Promise<FixtureSnapshot>
  control: (control: FixtureControl) => Promise<FixtureSnapshot>
}

export const test = base.extend<{ game: GameFixture }>({
  game: [async ({ page, request }, use) => {
    const created = await request.post(`${GAME_SERVICE_URL}/fixtures`)
    expect(created.ok()).toBe(true)
    const initial: FixtureSnapshot = await created.json()
    const url = `${GAME_SERVICE_URL}/fixtures/${initial.id}`
    await page.setExtraHTTPHeaders({ 'x-fixture-id': initial.id, 'x-fixture-user': 'Player 1' })

    await use({
      initial,
      snapshot: async () => {
        const response = await request.get(url)
        expect(response.ok()).toBe(true)
        return response.json()
      },
      control: async (control) => {
        const response = await request.post(url, { data: control })
        expect(response.ok()).toBe(true)
        return response.json()
      },
    })

    await request.delete(url)
  }, { auto: true }],
})

export { expect }

export async function openGame(page: Page, width?: number, height?: number) {
  if (width !== undefined && height !== undefined) await page.setViewportSize({ width, height })
  await page.goto('/')
  const create = page.getByRole('button', { name: 'Create lobby', exact: true })
  await expect(create.or(page.getByRole('main', { name: 'Game board' }))).toBeVisible()
  if (await create.isVisible()) {
    await createLobby(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Player 1', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Programming hand' }).getByRole('button')).toHaveCount(9)
}
