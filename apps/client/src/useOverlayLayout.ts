import { useLayoutEffect, useRef, useState } from 'react'

// Tracks content-based overlay layout.
function useOverlayLayout() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const hudContentRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLElement>(null)
  const [handBelowHud, setHandBelowHud] = useState(false)
  const [hudFits, setHudFits] = useState(false)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const hudContent = hudContentRef.current
    const hand = handRef.current
    const hud = hudContent?.parentElement

    if (!overlay || !hud || !hudContent || !hand) return

    // Refreshes the layout flags.
    const updateLayout = () => {
      const overlayStyle = getComputedStyle(overlay)
      const contentBottom =
        overlay.getBoundingClientRect().top +
        Number.parseFloat(overlayStyle.paddingTop) +
        hudContent.offsetHeight
      const handTop = hand.getBoundingClientRect().top
      const rowGap = Number.parseFloat(overlayStyle.rowGap) || 0

      setHandBelowHud(contentBottom + rowGap <= handTop)
      setHudFits(hud.scrollHeight <= hud.clientHeight)
    }

    const observer = new ResizeObserver(updateLayout)
    observer.observe(overlay)
    observer.observe(hud)
    observer.observe(hudContent)
    observer.observe(hand)

    return () => observer.disconnect()
  }, [])

  return { handBelowHud, handRef, hudContentRef, hudFits, overlayRef }
}

export default useOverlayLayout
