import { flushSync } from 'react-dom'

function cardPose(card: HTMLElement) {
  const bounds = card.getBoundingClientRect()
  const slot = card.closest('.programming-hand__slot')
  const style = getComputedStyle(card)
  const transform = slot ? getComputedStyle(slot).transform : style.transform
  const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform)

  return {
    left: `${bounds.left + bounds.width / 2}px`,
    top: `${bounds.top + bounds.height / 2}px`,
    width: style.width,
    height: style.height,
    borderRadius: style.borderRadius,
    rotate: style.rotate === 'none' ? `${Math.atan2(matrix.b, matrix.a)}rad` : style.rotate,
  }
}

export function animateCardTransfer(source: HTMLElement, update: () => void, fromPreview = false) {
  const overlay = source.closest('.game-overlay')
  const cardId = source.dataset.cardId
  if (!overlay || !cardId || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }

  const selector = `[data-card-id="${CSS.escape(cardId)}"]`
  const currentFlight = overlay.querySelector<HTMLElement>(`.card-transfer${selector}`)
  const preview = fromPreview
    ? overlay.querySelector<HTMLElement>(`.dragged-card[data-moving="true"]${selector}`)
    : null
  const from = cardPose(preview ?? currentFlight ?? source)
  currentFlight?.getAnimations().forEach((animation) => animation.cancel())

  flushSync(update)

  const destination = [...overlay.querySelectorAll<HTMLButtonElement>(`button${selector}`)]
    .find((card) => !card.closest('[aria-hidden="true"]'))
  if (!destination) return

  // The hand is reflowing too. Measure where this card's slot will settle.
  const slot = destination.closest('.programming-hand__slot')
  if (slot) {
    for (const animation of slot.getAnimations()) {
      if (animation instanceof CSSTransition && animation.transitionProperty === 'transform') {
        animation.finish()
      }
    }
  }
  const to = cardPose(destination)
  if (Object.entries(from).every(([key, value]) => value === to[key as keyof typeof to])) return

  const ghost = destination.cloneNode(true) as HTMLButtonElement
  ghost.className = destination.className + ' card-transfer'
  ghost.disabled = true
  ghost.inert = true
  ghost.setAttribute('aria-hidden', 'true')
  overlay.append(ghost)

  const motionStyle = getComputedStyle(overlay)
  const duration = Number.parseFloat(motionStyle.getPropertyValue('--hud-card-motion-duration'))
  const easing = motionStyle.getPropertyValue('--hud-card-motion-ease').trim()
  const flight = ghost.animate([from, to], { duration, easing, fill: 'both' })
  let trackingFrame = 0
  const effect = flight.effect as KeyframeEffect
  if (slot) {
    // Reflow can put the moving hand slot under or away from the pointer.
    // Follow the card's changing lift without restarting the flight.
    const trackHandPose = () => {
      effect.setKeyframes([from, cardPose(destination)])
      trackingFrame = requestAnimationFrame(trackHandPose)
    }
    trackingFrame = requestAnimationFrame(trackHandPose)
  }

  const hideDestination = destination.animate([{ opacity: 0 }, { opacity: 0 }], { duration, fill: 'both' })
  function finish() {
    cancelAnimationFrame(trackingFrame)
    hideDestination.cancel()
    ghost.remove()
  }
  flight.onfinish = finish
  flight.oncancel = finish
}
