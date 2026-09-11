import { useLayoutEffect, useRef, type RefObject } from 'react'
import { BOARD_CONFIG } from './boardConfig.ts'
import {
  clamp,
  parallaxOffset,
  zoomAround,
  type Camera,
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
  element: HTMLElement
  height: number
  liftHeight: number
}>

type RuntimeTile = Readonly<{
  parts: readonly RuntimePart[]
  tileCentre: BoardScene['tiles'][number]['tileCentre']
}>

type DragState = {
  camera: Camera
  id: number
  moved: boolean
  start: ScreenPoint
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
      const part = { element, height, liftHeight }
      const parts = partsByTile.get(key)
      if (parts) parts.push(part)
      else partsByTile.set(key, [part])
    }

    const runtimeTiles: RuntimeTile[] = scene.tiles.map((tile) => ({
      parts: partsByTile.get(`${tile.cell.x},${tile.cell.y}`) ?? [],
      tileCentre: tile.tileCentre,
    }))
    const camera = cameraRef.current
    let viewport = view.getBoundingClientRect()
    let drag: DragState | null = null
    let frameId = 0

    function render() {
      canvas.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`

      for (const tile of runtimeTiles) {
        const offset = parallaxOffset(tile.tileCentre, camera, viewport, BOARD_CONFIG)
        for (const part of tile.parts) {
          if (part.height === 0) continue
          part.element.style.setProperty(
            '--board-piece-x',
            `${offset.x * part.height}px`,
          )
          part.element.style.setProperty(
            '--board-piece-y',
            `${offset.y * part.height}px`,
          )
        }
      }
    }

    function requestFrame() {
      if (frameId === 0) {
        frameId = requestAnimationFrame(() => {
          frameId = 0
          render()
        })
      }
    }

    function centredPoint(clientX: number, clientY: number): ScreenPoint {
      return {
        x: clientX - viewport.left - viewport.width / 2,
        y: clientY - viewport.top - viewport.height / 2,
      }
    }

    function finishDrag(event: PointerEvent | null) {
      if (!drag || (event && event.pointerId !== drag.id)) return
      const pointerId = drag.id
      drag = null
      view.classList.remove('board-viewport--dragging')
      if (view.hasPointerCapture(pointerId)) {
        view.releasePointerCapture(pointerId)
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || drag) return
      event.preventDefault()
      drag = {
        camera: { ...camera },
        id: event.pointerId,
        moved: false,
        start: { x: event.clientX, y: event.clientY },
      }
      view.setPointerCapture(event.pointerId)
    }

    function onPointerMove(event: PointerEvent) {
      if (!event.isPrimary || !drag || drag.id !== event.pointerId) return
      const x = event.clientX - drag.start.x
      const y = event.clientY - drag.start.y
      if (Math.hypot(x, y) > BOARD_CONFIG.camera.dragThreshold) {
        drag.moved = true
      }
      if (!drag.moved) return

      camera.x = drag.camera.x + x
      camera.y = drag.camera.y + y
      view.classList.add('board-viewport--dragging')
      requestFrame()
    }

    function onPointerCancel(event: PointerEvent) {
      finishDrag(event)
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault()
      if (drag) return

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
      requestFrame()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== 'r' ||
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

      finishDrag(null)
      Object.assign(camera, {
        x: 0,
        y: 0,
        zoom: clamp(
          1,
          BOARD_CONFIG.camera.minZoom,
          BOARD_CONFIG.camera.maxZoom,
        ),
      })
      requestFrame()
    }

    function onBlur() {
      finishDrag(null)
    }

    function onResize() {
      viewport = view.getBoundingClientRect()
      requestFrame()
    }

    const resizeObserver = new ResizeObserver(onResize)
    view.addEventListener('pointerdown', onPointerDown)
    view.addEventListener('pointermove', onPointerMove)
    view.addEventListener('pointerup', finishDrag)
    view.addEventListener('pointercancel', onPointerCancel)
    view.addEventListener('lostpointercapture', onPointerCancel)
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
      view.removeEventListener('pointerup', finishDrag)
      view.removeEventListener('pointercancel', onPointerCancel)
      view.removeEventListener('lostpointercapture', onPointerCancel)
      view.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [canvasRef, scene, viewportRef])
}
