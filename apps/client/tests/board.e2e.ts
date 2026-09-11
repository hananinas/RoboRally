import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'

function styleNumber(locator: Locator, property: string): Promise<number> {
  return locator.evaluate((element, name) =>
    Number.parseFloat(element.style.getPropertyValue(name)), property)
}

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

test('animates hover and ripple without moving the ground plane', async ({ page }) => {
  const surface = page.locator(
    '[data-board-component="surface"][data-board-tile="6,5"]',
  )
  const ground = page.locator(
    '[data-board-layer="0"] [data-board-tile="6,5"]',
  )
  const calmX = await styleNumber(surface, '--board-piece-x')
  const groundStyle = await ground.getAttribute('style')

  await page.mouse.move(328, 204)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-scale'))
    .toBeCloseTo(1.025, 5)
  const hoverX = await styleNumber(surface, '--board-piece-x')
  expect(Math.abs(hoverX)).toBeGreaterThan(Math.abs(calmX))

  await page.mouse.click(328, 204)
  const rippleSamples: number[] = []
  for (let index = 0; index < 8; index += 1) {
    await page.waitForTimeout(16)
    rippleSamples.push(
      Math.abs(await styleNumber(surface, '--board-piece-x')),
    )
  }
  expect(
    rippleSamples.some((position) => position > Math.abs(hoverX) + 1),
  ).toBe(true)
  expect(await ground.getAttribute('style')).toBe(groundStyle)

  await page.waitForTimeout(2400)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-x'))
    .toBeCloseTo(hoverX, 4)

  await page.mouse.move(1100, 100)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-scale'))
    .toBeCloseTo(1, 5)
})

test('lifts laser artwork without stretching its item stack', async ({ page }) => {
  const selectors = [
    '[data-board-layer="3"] [data-board-component="laser1"][data-board-tile="6,7"]',
    '[data-board-layer="4"] [data-board-component="laser1"][data-board-tile="6,7"]',
    '[data-board-layer="5"] [data-board-component="laser2"][data-board-tile="6,7"]',
    '[data-board-layer="6"] [data-board-component="laser3"][data-board-tile="6,7"]',
  ]
  const pieces = selectors.map((selector) => page.locator(selector))
  const positions = () =>
    Promise.all(
      pieces.map((piece) => styleNumber(piece, '--board-piece-x')),
    )
  const before = await positions()

  await page.mouse.move(328, 360)
  await expect
    .poll(() => styleNumber(pieces[0], '--board-piece-scale'))
    .toBeCloseTo(1.025, 5)
  const after = await positions()

  expect(Math.abs(after[0])).toBeGreaterThan(Math.abs(before[0]))
  for (let index = 0; index < 3; index += 1) {
    expect(after[index + 1] - after[index]).toBeCloseTo(
      before[index + 1] - before[index],
      5,
    )
  }
})

test('pans without turning the press into a ripple', async ({ page }) => {
  const surface = page.locator(
    '[data-board-component="surface"][data-board-tile="6,5"]',
  )

  await page.mouse.move(328, 204)
  await page.mouse.down()
  await page.mouse.move(428, 244, { steps: 4 })
  await page.mouse.up()
  await expect
    .poll(() => styleNumber(surface, '--board-piece-scale'))
    .toBeCloseTo(1.025, 5)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-x'))
    .toBeCloseTo(-4.3824375, 4)
})

test('stops scheduling animation frames while idle', async ({ page }) => {
  await page.mouse.move(328, 204)
  await page.waitForTimeout(160)
  await page.mouse.move(1100, 100)
  await page.waitForTimeout(160)

  await page.evaluate(() => {
    const original = window.requestAnimationFrame
    let scheduledFrames = 0
    window.requestAnimationFrame = (callback) => {
      scheduledFrames += 1
      return original(callback)
    }
    Object.defineProperty(window, '__scheduledBoardFrames', {
      get: () => scheduledFrames,
    })
  })
  await page.waitForTimeout(300)

  expect(await page.evaluate(() => Reflect.get(window, '__scheduledBoardFrames'))).toBe(
    0,
  )
})

test.describe('touch board interaction', () => {
  test.use({ hasTouch: true })

  test('does not leave a hovered tile after a tap', async ({ page }) => {
    const surface = page.locator(
      '[data-board-component="surface"][data-board-tile="6,5"]',
    )

    await page.touchscreen.tap(328, 204)
    await expect
      .poll(() => styleNumber(surface, '--board-piece-scale'))
      .toBeCloseTo(1, 5)
  })
})
