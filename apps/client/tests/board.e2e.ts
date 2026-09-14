import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'

function styleNumber(locator: Locator, property: string): Promise<number> {
  return locator.evaluate((element, name) =>
    Number.parseFloat(element.style.getPropertyValue(name)), property)
}

function computedStyleNumber(locator: Locator, property: string): Promise<number> {
  return locator.evaluate((element, name) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue(name)), property)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('renders the board through isolated global paint planes', async ({ page }) => {
  const board = page.getByRole('main', { name: 'Game board' })
  const planes = board.locator('.board-plane')

  await expect(planes).toHaveCount(14)
  await expect(board.locator('.board-plane > .board-piece')).toHaveCount(1339)
  await expect(board.locator('.board-piece--hole')).toHaveCount(6)
  await expect(board.locator('.board-hole-depth')).toHaveCount(48)
  await expect(board.locator('.board-piece--wall-black')).toHaveCount(6)
  await expect(board.locator('.board-piece--wall-yellow')).toHaveCount(8)
  await expect(board.locator('.board-piece--wall-edge-black')).toHaveCount(28)
  await expect(board.locator('.board-piece--wall-edge-yellow')).toHaveCount(28)

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

test('renders sprite artwork at its configured aspect ratio', async ({ page }) => {
  const assets = page.locator('.board-piece--asset')
  await expect(assets).toHaveCount(31)

  expect(
    await assets.evaluateAll((elements) =>
      elements.every((element) => {
        if (!(element instanceof SVGSVGElement)) return false
        const style = getComputedStyle(element)
        const renderedWidth = Number.parseFloat(style.width)
        const renderedHeight = Number.parseFloat(style.height)
        const viewBox = element.viewBox.baseVal
        const symbol = element.querySelector('use')?.getAttribute('href')
        const expectedWidth = symbol?.startsWith('#laser')
          ? { rendered: 59.04, viewBox: 72 }
          : symbol?.startsWith('#testTank')
            ? { rendered: 46.8, viewBox: 57 }
            : undefined
        return (
          expectedWidth !== undefined &&
          viewBox.width === expectedWidth.viewBox &&
          Math.abs(renderedWidth - expectedWidth.rendered) < 0.02 &&
          Math.abs(renderedHeight / renderedWidth - viewBox.height / viewBox.width) <
            0.001
        )
      }),
    ),
  ).toBe(true)
})

test('moves the debug tanks forward repeatedly with a linear CSS transition', async ({ page }) => {
  const tanks = [
    { tile: '9,7', expected: { x: -78, y: 0 } },
    { tile: '10,7', expected: { x: 0, y: -78 } },
    { tile: '11,7', expected: { x: 0, y: 78 } },
  ] as const
  const selectors = tanks.map(({ tile }) =>
    page.locator(`[data-board-debug-tank="${tile}"]`),
  )

  for (const tank of selectors) await expect(tank).toHaveCount(5)

  await page.locator('.board-viewport').evaluate((element) => {
    const viewport = element as HTMLElement
    viewport.style.setProperty('--tank-move-duration', '1000ms')
  })
  const before = await Promise.all(
    selectors.map((tank) =>
      Promise.all(
        Array.from({ length: 5 }, async (_, layer) => ({
          left: await computedStyleNumber(tank.nth(layer), 'left'),
          top: await computedStyleNumber(tank.nth(layer), 'top'),
        })),
      ),
    ),
  )
  const initialParallax = await Promise.all(
    Array.from({ length: 5 }, (_, layer) =>
      styleNumber(selectors[0].nth(layer), '--board-piece-x'),
    ),
  )

  await page.keyboard.press('Space')
  await page.waitForTimeout(400)
  const midway = await computedStyleNumber(
    selectors[0].first(),
    'left',
  )
  expect(midway).toBeLessThan(-83)
  expect(midway).toBeGreaterThan(-151)

  await expect
    .poll(() => computedStyleNumber(selectors[0].first(), 'left'))
    .toBeCloseTo(-156, 1)

  for (const [tankIndex, tank] of selectors.entries()) {
    const after = await Promise.all(
      Array.from({ length: 5 }, async (_, layer) => ({
        left: await computedStyleNumber(tank.nth(layer), 'left'),
        top: await computedStyleNumber(tank.nth(layer), 'top'),
      })),
    )
    const initial = before[tankIndex]
    for (const [layer, position] of after.entries()) {
      expect(position.left - initial[layer].left).toBeCloseTo(
        tanks[tankIndex].expected.x,
        1,
      )
      expect(position.top - initial[layer].top).toBeCloseTo(
        tanks[tankIndex].expected.y,
        1,
      )
    }
  }

  await page.keyboard.press('Space')
  await expect
    .poll(() => computedStyleNumber(selectors[0].first(), 'left'))
    .toBeCloseTo(-234, 1)

  for (const [tankIndex, tank] of selectors.entries()) {
    const afterSecondMove = await Promise.all(
      Array.from({ length: 5 }, async (_, layer) => ({
        left: await computedStyleNumber(tank.nth(layer), 'left'),
        top: await computedStyleNumber(tank.nth(layer), 'top'),
      })),
    )
    for (const [layer, position] of afterSecondMove.entries()) {
      expect(position.left - before[tankIndex][layer].left).toBeCloseTo(
        tanks[tankIndex].expected.x * 2,
        1,
      )
      expect(position.top - before[tankIndex][layer].top).toBeCloseTo(
        tanks[tankIndex].expected.y * 2,
        1,
      )
    }
  }

  await expect
    .poll(() => styleNumber(selectors[0].last(), '--board-piece-x'))
    .toBeLessThan(initialParallax[4])
  await expect(selectors[0].first()).toHaveAttribute('data-board-tile', '7,7')
  await expect(selectors[1].first()).toHaveAttribute('data-board-tile', '10,5')
  await expect(selectors[2].first()).toHaveAttribute('data-board-tile', '11,9')

  const destinationSurface = page.locator(
    '[data-board-component="surface"][data-board-tile="10,5"]',
  )
  const redTankTopLayer = selectors[1].last()
  const tankYBeforeRipple = await styleNumber(
    redTankTopLayer,
    '--board-piece-y',
  )
  const surfaceYBeforeRipple = await styleNumber(
    destinationSurface,
    '--board-piece-y',
  )
  const destinationBox = await destinationSurface.boundingBox()
  if (!destinationBox) throw new Error('Destination tile is unavailable')

  await page.mouse.click(
    destinationBox.x + destinationBox.width / 2,
    destinationBox.y + destinationBox.height / 2,
  )
  await expect
    .poll(() => styleNumber(destinationSurface, '--board-piece-y'))
    .not.toBeCloseTo(surfaceYBeforeRipple, 2)
  await expect
    .poll(() => styleNumber(redTankTopLayer, '--board-piece-y'))
    .not.toBeCloseTo(tankYBeforeRipple, 2)
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

test('renders directional walls between tiles', async ({ page }) => {
  const westWall = page.locator('[data-board-tile="8,4"][data-board-wall="west"]')
  const northWall = page.locator('[data-board-tile="4,6"][data-board-wall="north"]')
  const eastWall = page.locator('[data-board-tile="12,4"][data-board-wall="east"]')
  const southWall = page.locator('[data-board-tile="16,8"][data-board-wall="south"]')
  const cornerWalls = page.locator('[data-board-tile="8,10"][data-board-wall]')

  await expect(westWall).toHaveCount(8)
  await expect(northWall).toHaveCount(8)
  await expect(eastWall).toHaveCount(8)
  await expect(southWall).toHaveCount(8)
  await expect(cornerWalls).toHaveCount(16)

  expect(
    await westWall.evaluateAll((walls) =>
      walls.map((wall) => ({
        component: wall.getAttribute('data-board-component'),
        layer: Number(wall.parentElement?.getAttribute('data-board-layer')),
      })),
    ),
  ).toEqual([
    { component: 'wallEdgeBlack', layer: 0 },
    { component: 'wallEdgeBlack', layer: 1 },
    { component: 'wallEdgeYellow', layer: 2 },
    { component: 'wallEdgeYellow', layer: 3 },
    { component: 'wallEdgeBlack', layer: 4 },
    { component: 'wallEdgeBlack', layer: 5 },
    { component: 'wallEdgeYellow', layer: 6 },
    { component: 'wallEdgeYellow', layer: 7 },
  ])

  const ground = page.locator(
    '[data-board-layer="0"] [data-board-tile="8,4"][data-board-component="ground"]',
  )
  const westNeighbour = page.locator(
    '[data-board-layer="0"] [data-board-tile="7,4"][data-board-component="ground"]',
  )
  const bottomWall = page.locator(
    '[data-board-layer="0"] [data-board-tile="8,4"][data-board-wall="west"]',
  )
  const [groundBox, neighbourBox, wallBox] = await Promise.all([
    ground.boundingBox(),
    westNeighbour.boundingBox(),
    bottomWall.boundingBox(),
  ])
  if (!groundBox || !neighbourBox || !wallBox) {
    throw new Error('Wall geometry is unavailable')
  }

  const wallCentreX = wallBox.x + wallBox.width / 2
  const boundaryX =
    (groundBox.x +
      groundBox.width / 2 +
      neighbourBox.x +
      neighbourBox.width / 2) /
    2
  expect(wallCentreX).toBeCloseTo(boundaryX, 4)
  expect(wallBox.y + wallBox.height / 2).toBeCloseTo(
    groundBox.y + groundBox.height / 2,
    4,
  )
  expect(wallBox.width).toBeCloseTo(12, 4)
  expect(wallBox.height).toBeCloseTo(72, 4)
  await expect(bottomWall).toHaveCSS('border-radius', '5px')

  const cornerNorth = page.locator(
    '[data-board-layer="0"] [data-board-tile="8,10"][data-board-wall="north"]',
  )
  const cornerEast = page.locator(
    '[data-board-layer="0"] [data-board-tile="8,10"][data-board-wall="east"]',
  )
  const [northBox, eastBox] = await Promise.all([
    cornerNorth.boundingBox(),
    cornerEast.boundingBox(),
  ])
  if (!northBox || !eastBox) throw new Error('Wall corner is unavailable')

  expect(northBox.width).toBeCloseTo(81, 4)
  expect(eastBox.height).toBeCloseTo(81, 4)
  const overlapWidth =
    Math.min(northBox.x + northBox.width, eastBox.x + eastBox.width) -
    Math.max(northBox.x, eastBox.x)
  const overlapHeight =
    Math.min(northBox.y + northBox.height, eastBox.y + eastBox.height) -
    Math.max(northBox.y, eastBox.y)
  expect(overlapWidth).toBeCloseTo(12, 4)
  expect(overlapHeight).toBeCloseTo(12, 4)

  const surface = page.locator(
    '[data-board-tile="8,4"][data-board-component="surface"]',
  )
  const raisedWall = page.locator(
    '[data-board-layer="2"] [data-board-tile="8,4"][data-board-wall="west"]',
  )
  await page.mouse.move(484, 126)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-scale'))
    .toBeCloseTo(1.025, 5)
  await expect
    .poll(() => styleNumber(raisedWall, '--board-piece-scale'))
    .toBe(1)
})

test('uses a pillar without a base for tiles walled on every side', async ({ page }) => {
  const tile = page.locator('[data-board-tile="12,10"]')

  await expect(tile).toHaveCount(14)
  await expect(
    page.locator('[data-board-tile="12,10"][data-board-wall]'),
  ).toHaveCount(0)
  await expect(
    page.locator(
      '[data-board-tile="12,10"][data-board-component="ground"], [data-board-tile="12,10"][data-board-component="surface"]',
    ),
  ).toHaveCount(0)
  await expect(
    page.locator(
      '[data-board-tile="12,10"].board-piece--wall-black, [data-board-tile="12,10"].board-piece--wall-yellow',
    ),
  ).toHaveCount(14)
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
  await expect
    .poll(async () => (await cameraMatrix()).zoom)
    .toBeCloseTo(Math.exp(0.3), 5)

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

test('preserves one board runtime across active game rerenders', async ({ page }) => {
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

  await page
    .getByRole('region', { name: 'Programming hand' })
    .getByRole('button')
    .first()
    .click()

  await expect(page.locator('.board-plane')).toHaveCount(14)
  await expect.poll(cameraMatrix).toEqual({ x: 100, y: 40, zoom: 1 })
})

test('runs board interactions without browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.reload()

  await page.mouse.move(328, 204)
  await page.mouse.click(328, 204)
  await page.mouse.wheel(0, -100)
  await page.keyboard.press('r')
  await page.waitForTimeout(100)

  expect(errors).toEqual([])
})
