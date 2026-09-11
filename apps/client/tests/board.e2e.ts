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

test('pans, zooms around the cursor, and resets the camera', async ({ page }) => {
  const camera = page.locator('.board-canvas')
  const cameraMatrix = () =>
    camera.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform)
      return { x: matrix.e, y: matrix.f, zoom: matrix.a }
    })

  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.mouse.move(500, 340, { steps: 4 })
  await page.mouse.up()
  await expect.poll(cameraMatrix).toEqual({ x: 100, y: 40, zoom: 1 })

  const cursor = { x: 500 - 640, y: 340 - 360 }
  const before = await cameraMatrix()
  const worldBefore = {
    x: (cursor.x - before.x) / before.zoom,
    y: (cursor.y - before.y) / before.zoom,
  }
  await page.mouse.wheel(0, -300)
  await expect.poll(async () => (await cameraMatrix()).zoom).toBeGreaterThan(1)

  const after = await cameraMatrix()
  expect((cursor.x - after.x) / after.zoom).toBeCloseTo(worldBefore.x, 3)
  expect((cursor.y - after.y) / after.zoom).toBeCloseTo(worldBefore.y, 3)

  await page.keyboard.press('r')
  await expect.poll(cameraMatrix).toEqual({ x: 0, y: 0, zoom: 1 })

  await page.mouse.wheel(0, -100000)
  await expect.poll(async () => (await cameraMatrix()).zoom).toBe(4)
  await page.mouse.wheel(0, 100000)
  await expect.poll(async () => (await cameraMatrix()).zoom).toBe(0.3)
})

test('recalculates parallax after a portrait resize', async ({ page }) => {
  const surface = page.locator(
    '[data-board-component="surface"][data-board-tile="6,5"]',
  )
  const pieceX = () =>
    surface.evaluate((element) =>
      Number.parseFloat(
        element.style.getPropertyValue('--board-piece-x'),
      ),
    )
  const before = await pieceX()

  await page.setViewportSize({ width: 600, height: 1000 })
  await expect.poll(pieceX).not.toBe(before)
  await expect.poll(pieceX).toBeCloseTo(-4.71744, 4)
})
