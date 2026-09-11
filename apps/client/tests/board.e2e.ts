import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('renders the board through isolated global paint planes', async ({ page }) => {
  const board = page.getByRole('main', { name: 'Game board' })
  const planes = board.locator('.board-plane')

  await expect(planes).toHaveCount(14)
  await expect(board.locator('.board-plane > .board-piece')).toHaveCount(1318)
  await expect(board.locator('.board-piece--hole')).toHaveCount(6)
  await expect(board.locator('.board-hole-depth')).toHaveCount(48)
  await expect(board.locator('.board-piece--wall-black')).toHaveCount(36)
  await expect(board.locator('.board-piece--wall-yellow')).toHaveCount(48)

  expect(
    await planes.evaluateAll((elements) =>
      elements.every((element, layer) => {
        const style = getComputedStyle(element)
        return (
          Number(element.getAttribute('data-board-layer')) === layer &&
          Number(style.zIndex) === layer &&
          style.isolation === 'isolate'
        )
      }),
    ),
  ).toBe(true)
})

test('loads laser artwork at its intrinsic aspect ratio', async ({ page }) => {
  const assets = page.locator('.board-piece--asset')
  await expect(assets).toHaveCount(16)

  expect(
    await assets.evaluateAll((images) =>
      images.every((element) => {
        const image = element as HTMLImageElement
        const bounds = image.getBoundingClientRect()
        return (
          image.complete &&
          image.naturalWidth === 72 &&
          Math.abs(bounds.width - 59.04) < 0.02 &&
          Math.abs(bounds.height / bounds.width - image.naturalHeight / 72) <
            0.001
        )
      }),
    ),
  ).toBe(true)
})

test('keeps ground shadows below all raised surfaces', async ({ page }) => {
  const result = await page.evaluate(() => {
    const ground = document.querySelector<HTMLElement>(
      '[data-board-layer="0"] [data-board-tile="6,5"]',
    )!
    const surface = document.querySelector<HTMLElement>(
      '[data-board-component="surface"][data-board-tile="10,7"]',
    )!
    Object.assign(ground.style, {
      left: '0',
      top: '0',
      zIndex: '999999',
      pointerEvents: 'auto',
    })
    surface.style.pointerEvents = 'auto'
    const bounds = document.querySelector('.board-viewport')!.getBoundingClientRect()
    return document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    ) === surface
  })

  expect(result).toBe(true)
})

test('keeps board rendering behind active game controls', async ({ page }) => {
  const controls = page.getByRole('complementary', { name: 'Game controls' })
  await expect(controls.getByRole('heading', { name: 'Player Name' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Programming hand' })).toBeVisible()
  await expect(
    page.locator(
      '[data-board-layer="3"] [data-board-component="laser1"][data-board-tile="6,7"]',
    ),
  ).toHaveCSS('z-index', '1')
})
