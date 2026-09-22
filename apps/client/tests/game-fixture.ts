import { expect, test as base } from '@playwright/test'
import {
  GAME_SERVICE_URL,
  type FixtureControl,
  type FixtureSnapshot,
} from './game-fixture-data.ts'

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
    await page.setExtraHTTPHeaders({ 'x-fixture-id': initial.id })

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
