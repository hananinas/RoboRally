import { useLayoutEffect, useRef, type RefObject } from 'react'
import { BOARD_CONFIG } from './boardConfig.ts'
import {
  approach,
  cellAtPoint,
  clamp,
  liftedDepth,
  parallaxOffset,
  rippleHeight,
  surfaceEffect,
  tileCentre,
  zoomAround,
  type Camera,
  type Ripple,
  type ScreenPoint,
} from './boardMath.ts'
import type { BoardScene } from './boardScene.ts'

type BoardInteractionOptions = Readonly<{
  canvasRef: RefObject<HTMLDivElement | null>
  scene: BoardScene
  viewportRef: RefObject<HTMLElement | null>
}>

type MutableCamera = {
  x: number
  y: number
  zoom: number
}

type RuntimePart = Readonly<{
  boardPosition?: {
    worldX: number
    worldY: number
  }
  element: HTMLElement
  height: number
  liftHeight: number
  scalable: boolean
}>

type RuntimeTile = {
  cell: BoardScene['tiles'][number]['cell']
  hole: boolean
  hover: number
  hoverTarget: number
  parts: RuntimePart[]
  tileCentre: BoardScene['tiles'][number]['tileCentre']
}

type DragState = {
  camera: Camera
  id: number
  moved: boolean
  start: ScreenPoint
  tile: RuntimeTile | null
}

type RuntimeTank = {
  angle: number
  direction: number
  parts: RuntimePart[]
  x: number
  y: number
}

export default function useBoardInteraction({
  canvasRef,
  scene,
  viewportRef,
}: BoardInteractionOptions): void {
  const cameraRef = useRef<MutableCamera>({
    x: 0,
    y: 0,
    zoom: clamp(
      1,
      BOARD_CONFIG.camera.minZoom,
      BOARD_CONFIG.camera.maxZoom,
    ),
  })

  useLayoutEffect(() => {
    const currentView = viewportRef.current
    const currentCanvas = canvasRef.current
    if (!currentView || !currentCanvas) return
    const view: HTMLElement = currentView
    const canvas: HTMLDivElement = currentCanvas

    const partsByTile = new Map<string, RuntimePart[]>()
    for (const element of view.querySelectorAll<HTMLElement>(
      '[data-board-height][data-board-tile]',
    )) {
      const key = element.dataset.boardTile
      if (!key) continue
      const height = Number(element.dataset.boardHeight)
      const liftHeight = Number(element.dataset.boardLiftHeight ?? height)
      const part = {
        ...(element.classList.contains('board-piece--test-tank')
          ? {
              boardPosition: {
                worldX: Number.parseFloat(element.style.left),
                worldY: Number.parseFloat(element.style.top),
              },
            }
          : {}),
        element,
        height,
        liftHeight,
        scalable: element.dataset.boardWall === undefined,
      }
      const parts = partsByTile.get(key)
      if (parts) parts.push(part)
      else partsByTile.set(key, [part])
    }

    const runtimeTiles: RuntimeTile[] = scene.tiles.map((tile) => ({
      cell: tile.cell,
      hole: tile.hole,
      hover: 0,
      hoverTarget: 0,
      parts: partsByTile.get(`${tile.cell.x},${tile.cell.y}`) ?? [],
      tileCentre: tile.tileCentre,
    }))
    const camera = cameraRef.current
    const ripples: Ripple[] = []
    let viewport = view.getBoundingClientRect()
    let drag: DragState | null = null
    let hoveredTile: RuntimeTile | null = null
    let pointer: ScreenPoint | null = null
    let frameId = 0
    let previousFrame: number | null = null
    const tankParts = runtimeTiles.flatMap((tile) =>
      tile.parts.filter((part) => part.boardPosition !== undefined),
    )
    const tankLocations = new Map<RuntimePart, RuntimeTile>()
    const tanksById = new Map<string, RuntimeTank>()
    for (const tile of runtimeTiles) {
      for (const part of tile.parts) {
        if (!part.boardPosition) continue
        tankLocations.set(part, tile)
        const id = part.element.dataset.boardDebugTank
        if (!id) continue
        const tank = tanksById.get(id)
        if (tank) {
          tank.parts.push(part)
        } else {
          const angle = Number.parseFloat(
            getComputedStyle(part.element).getPropertyValue(
              '--board-piece-angle',
            ),
          )
          tanksById.set(id, {
            angle,
            direction: ((Math.round(angle / 90) % 4) + 4) % 4,
            parts: [part],
            x: tile.cell.x,
            y: tile.cell.y,
          })
        }
      }
    }
    const tanks = Array.from(tanksById.values())

    function render(now: number) {
      canvas.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`

      for (const tile of runtimeTiles) {
        const wave = tile.hole
          ? 0
          : rippleHeight(tile.cell, ripples, now, BOARD_CONFIG.ripple)
        const effect = surfaceEffect(tile.hover, wave, BOARD_CONFIG)
        for (const part of tile.parts) {
          if (part.height === 0) continue
          const offset = parallaxOffset(
            part.boardPosition ?? tile.tileCentre,
            camera,
            viewport,
            BOARD_CONFIG,
          )
          const depth = liftedDepth(part.height, part.liftHeight, effect.height)
          part.element.style.setProperty(
            '--board-piece-x',
            `${offset.x * depth}px`,
          )
          part.element.style.setProperty(
            '--board-piece-y',
            `${offset.y * depth}px`,
          )
          part.element.style.setProperty(
            '--board-piece-scale',
            `${part.scalable ? effect.scale : 1}`,
          )
        }
      }
    }

    function requestFrame() {
      if (frameId === 0) {
        frameId = requestAnimationFrame(animate)
      }
    }

    function updateHover(delta: number): boolean {
      const step =
        BOARD_CONFIG.hoverDuration === 0
          ? 1
          : delta / BOARD_CONFIG.hoverDuration
      let active = false

      for (const tile of runtimeTiles) {
        tile.hover = approach(tile.hover, tile.hoverTarget, step)
        if (tile.hover !== tile.hoverTarget) active = true
      }

      return active
    }

    function animate(now: number) {
      frameId = 0
      const delta =
        previousFrame === null
          ? 0
          : Math.min(0.05, (now - previousFrame) / 1000)
      previousFrame = now
      const hoverActive = updateHover(delta)
      const lifetime = BOARD_CONFIG.ripple.lifetime * 1000

      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (now - ripples[index].startedAt >= lifetime) {
          ripples.splice(index, 1)
        }
      }

      render(now)
      if (hoverActive || ripples.length > 0) requestFrame()
      else previousFrame = null
    }

    function centredPoint(clientX: number, clientY: number): ScreenPoint {
      return {
        x: clientX - viewport.left - viewport.width / 2,
        y: clientY - viewport.top - viewport.height / 2,
      }
    }

    function tileAtClient(point: ScreenPoint): RuntimeTile | null {
      if (
        point.x < viewport.left ||
        point.x >= viewport.right ||
        point.y < viewport.top ||
        point.y >= viewport.bottom
      ) {
        return null
      }

      const cell = cellAtPoint(
        centredPoint(point.x, point.y),
        camera,
        {
          columns: Number(canvas.dataset.boardColumns),
          rows: Number(canvas.dataset.boardRows),
        },
        BOARD_CONFIG,
      )
      if (!cell) return null
      return runtimeTiles[cell.y * Number(canvas.dataset.boardColumns) + cell.x]
    }

    function setHover(tile: RuntimeTile | null) {
      const next = tile && !tile.hole ? tile : null
      if (hoveredTile === next) return
      if (hoveredTile) hoveredTile.hoverTarget = 0
      hoveredTile = next
      if (hoveredTile) hoveredTile.hoverTarget = 1
      requestFrame()
    }

    function refreshHover() {
      setHover(pointer && !drag?.moved ? tileAtClient(pointer) : null)
    }

    function rememberPointer(event: PointerEvent) {
      pointer =
        event.pointerType === 'touch'
          ? null
          : { x: event.clientX, y: event.clientY }
    }

    function startRipple(tile: RuntimeTile) {
      ripples.push({
        x: tile.cell.x,
        y: tile.cell.y,
        startedAt: performance.now(),
      })
      requestFrame()
    }

    function finishDrag(event: PointerEvent | null, cancelled: boolean) {
      if (!drag || (event && event.pointerId !== drag.id)) return
      const press = drag
      drag = null
      view.classList.remove('board-viewport--dragging')
      if (view.hasPointerCapture(press.id)) {
        view.releasePointerCapture(press.id)
      }
      if (cancelled || !event) pointer = null
      else rememberPointer(event)
      refreshHover()

      if (
        !cancelled &&
        event &&
        !press.moved &&
        press.tile &&
        Math.hypot(
          event.clientX - press.start.x,
          event.clientY - press.start.y,
        ) <= BOARD_CONFIG.camera.dragThreshold
      ) {
        startRipple(press.tile)
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || drag) return
      event.preventDefault()
      rememberPointer(event)
      drag = {
        camera: { ...camera },
        id: event.pointerId,
        moved: false,
        start: { x: event.clientX, y: event.clientY },
        tile: tileAtClient({ x: event.clientX, y: event.clientY }),
      }
      view.setPointerCapture(event.pointerId)
      refreshHover()
    }

    function onPointerMove(event: PointerEvent) {
      if (!event.isPrimary) return
      rememberPointer(event)
      if (drag && drag.id === event.pointerId) {
        const x = event.clientX - drag.start.x
        const y = event.clientY - drag.start.y
        if (Math.hypot(x, y) > BOARD_CONFIG.camera.dragThreshold) {
          drag.moved = true
        }
        if (drag.moved) {
          camera.x = drag.camera.x + x
          camera.y = drag.camera.y + y
          view.classList.add('board-viewport--dragging')
          requestFrame()
        }
      }
      refreshHover()
    }

    function onPointerCancel(event: PointerEvent) {
      finishDrag(event, true)
    }

    function onPointerUp(event: PointerEvent) {
      finishDrag(event, false)
    }

    function onPointerLeave() {
      pointer = null
      refreshHover()
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault()
      if (drag) return
      pointer = { x: event.clientX, y: event.clientY }

      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? viewport.height
            : 1
      const zoom = clamp(
        camera.zoom *
          Math.exp(
            -event.deltaY * unit * BOARD_CONFIG.camera.wheelSensitivity,
          ),
        BOARD_CONFIG.camera.minZoom,
        BOARD_CONFIG.camera.maxZoom,
      )
      Object.assign(
        camera,
        zoomAround(centredPoint(event.clientX, event.clientY), camera, zoom),
      )
      refreshHover()
      requestFrame()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.matches('input, textarea, select, [contenteditable]')
      ) {
        return
      }

      // this is for testing tank movement, remove for later development
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault()
        if (event.repeat || tankParts.length === 0) return

        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const quarterTurn = event.key === 'ArrowLeft' ? -1 : 1
          for (const tank of tanks) {
            tank.angle += quarterTurn * 90
            tank.direction = (tank.direction + quarterTurn + 4) % 4
            for (const part of tank.parts) {
              part.element.style.setProperty(
                '--board-piece-angle',
                `${tank.angle}deg`,
              )
            }
          }
          return
        }

        const forward = event.key === 'ArrowUp' ? 1 : -1
        const directions = [
          { x: 0, y: -1 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
        ] as const
        const columns = Number(canvas.dataset.boardColumns)
        const rows = Number(canvas.dataset.boardRows)

        for (const tank of tanks) {
          const direction = directions[tank.direction]
          const x = tank.x + direction.x * forward
          const y = tank.y + direction.y * forward
          if (x < 0 || x >= columns || y < 0 || y >= rows) continue

          const destination = runtimeTiles[y * columns + x]
          const centre = tileCentre({ x, y }, { columns, rows }, BOARD_CONFIG)
          tank.x = x
          tank.y = y

          for (const part of tank.parts) {
            const current = tankLocations.get(part)
            const position = part.boardPosition
            if (!current || !position) continue
            const currentIndex = current.parts.indexOf(part)
            if (currentIndex !== -1) current.parts.splice(currentIndex, 1)
            destination.parts.push(part)
            tankLocations.set(part, destination)
            position.worldX = centre.worldX
            position.worldY = centre.worldY
            part.element.style.left = `${centre.worldX}px`
            part.element.style.top = `${centre.worldY}px`
            part.element.dataset.boardTile = `${x},${y}`
          }
        }
        requestFrame()
        return
      }

      if (event.key.toLowerCase() !== 'r') return

      finishDrag(null, true)
      Object.assign(camera, {
        x: 0,
        y: 0,
        zoom: clamp(
          1,
          BOARD_CONFIG.camera.minZoom,
          BOARD_CONFIG.camera.maxZoom,
        ),
      })
      refreshHover()
      requestFrame()
    }

    function onBlur() {
      finishDrag(null, true)
      pointer = null
      refreshHover()
    }

    function onResize() {
      viewport = view.getBoundingClientRect()
      requestFrame()
    }

    const resizeObserver = new ResizeObserver(onResize)
    view.addEventListener('pointerdown', onPointerDown)
    view.addEventListener('pointermove', onPointerMove)
    view.addEventListener('pointerup', onPointerUp)
    view.addEventListener('pointercancel', onPointerCancel)
    view.addEventListener('lostpointercapture', onPointerCancel)
    view.addEventListener('pointerleave', onPointerLeave)
    view.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKeyDown)
    resizeObserver.observe(view)
    requestFrame()

    return () => {
      if (frameId !== 0) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      view.classList.remove('board-viewport--dragging')
      view.removeEventListener('pointerdown', onPointerDown)
      view.removeEventListener('pointermove', onPointerMove)
      view.removeEventListener('pointerup', onPointerUp)
      view.removeEventListener('pointercancel', onPointerCancel)
      view.removeEventListener('lostpointercapture', onPointerCancel)
      view.removeEventListener('pointerleave', onPointerLeave)
      view.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [canvasRef, scene, viewportRef])
}
