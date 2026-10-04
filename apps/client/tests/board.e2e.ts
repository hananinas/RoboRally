import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import type { BoardHarnessApi } from './board-harness.tsx'

function styleNumber(locator: Locator, property: string): Promise<number> {
  return locator.evaluate((element, name) =>
    Number.parseFloat(element.style.getPropertyValue(name)), property)
}

function computedStyleNumber(locator: Locator, property: string): Promise<number> {
  return locator.evaluate((element, name) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue(name)), property)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/board-harness.html')
})

test('renders sprite artwork at its configured aspect ratio', async ({ page }) => {
  const assets = page.locator('.board-piece--asset')
  await expect(assets.first()).toBeVisible()

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

test('plays rapid server results one robot at a time without replacing its sprite', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.reload()
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'))

  const red = page.locator('[data-robot-id="red"]')
  const blue = page.locator('[data-robot-id="blue"]')
  const original = await red.first().elementHandle()
  if (!original) throw new Error('Robot sprite is unavailable')

  const steps = [
    { gameId: 'demo', registerIndex: 0, robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 10, y: 6 }, orientation: 'NORTH' } },
    { gameId: 'demo', registerIndex: 1, robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 10, y: 5 }, orientation: 'NORTH' } },
    { gameId: 'demo', registerIndex: 2, robotId: 'red', instruction: 'TURN_LEFT', position: { coordinate: { x: 10, y: 5 }, orientation: 'WEST' } },
    { gameId: 'demo', registerIndex: 3, robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 9, y: 5 }, orientation: 'WEST' } },
    { gameId: 'demo', registerIndex: 4, robotId: 'red', instruction: 'TURN_LEFT', position: { coordinate: { x: 9, y: 5 }, orientation: 'SOUTH' } },
  ] as const
  await page.evaluate((actions) => {
    (window as Window & { boardFixture: BoardHarnessApi }).boardFixture.enqueue(actions)
  }, steps)

  for (const [index, step] of steps.entries()) {
    await expect(red.first()).toHaveAttribute(
      'data-board-tile',
      `${step.position.coordinate.x},${step.position.coordinate.y}`,
    )
    expect(await red.first().evaluate((element, first) => element === first, original)).toBe(true)
    await expect(blue.first()).toHaveAttribute('data-board-tile', '9,7')
    if (index === 0) {
      await page.clock.runFor(300)
      const midway = await computedStyleNumber(red.first(), 'top')
      expect(midway).toBeLessThan(0)
      expect(midway).toBeGreaterThan(-78)
      await page.clock.runFor(300)
    } else {
      await page.clock.runFor(step.instruction === 'TURN_LEFT' ? 300 : 600)
    }
  }
  await expect.poll(() => computedStyleNumber(red.first(), '--board-piece-angle'))
    .toBeCloseTo(-180, 1)
})

test('arrow keys do not move robots or block HUD scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const hud = page.locator('.game-hud')
  const red = page.locator('[data-robot-id="red"]').first()
  await page.getByRole('button', { name: 'Collapse player details' }).focus()
  const initialScroll = await hud.evaluate((element) => element.scrollTop)

  await page.keyboard.press('ArrowDown')
  await expect.poll(() => hud.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScroll)
  await expect(red).toHaveAttribute('data-board-tile', '10,7')
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
  await expect(
    page.locator('[data-board-tile="12,10"][data-board-wall]'),
  ).toHaveCount(0)
  await expect(
    page.locator(
      '[data-board-tile="12,10"][data-board-component="ground"], [data-board-tile="12,10"][data-board-component="surface"]',
    ),
  ).toHaveCount(0)
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
  // Reload with a controlled clock so slow CI reads cannot miss the ripple peak.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.reload()
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'))

  const surface = page.locator(
    '[data-board-component="surface"][data-board-tile="6,5"]',
  )
  const ground = page.locator(
    '[data-board-layer="0"] [data-board-tile="6,5"]',
  )
  const calmX = await styleNumber(surface, '--board-piece-x')
  const groundStyle = await ground.getAttribute('style')

  await page.mouse.move(328, 204)
  await page.clock.runFor(160)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-scale'))
    .toBeCloseTo(1.025, 5)
  const hoverX = await styleNumber(surface, '--board-piece-x')
  expect(Math.abs(hoverX)).toBeGreaterThan(Math.abs(calmX))

  await page.mouse.click(328, 204)
  const rippleSamples: number[] = []
  for (let index = 0; index < 8; index += 1) {
    await page.clock.runFor(16)
    rippleSamples.push(
      Math.abs(await styleNumber(surface, '--board-piece-x')),
    )
  }
  expect(
    rippleSamples.some((position) => position > Math.abs(hoverX) + 1),
  ).toBe(true)
  expect(await ground.getAttribute('style')).toBe(groundStyle)

  await page.clock.runFor(2400)
  await expect
    .poll(() => styleNumber(surface, '--board-piece-x'))
    .toBeCloseTo(hoverX, 4)

  await page.mouse.move(1100, 100)
  await page.clock.runFor(160)
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

test('preserves the board camera across HUD rerenders', async ({ page }) => {
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

  await expect.poll(cameraMatrix).toEqual({ x: 100, y: 40, zoom: 1 })
})

