import { useEffect, useState } from 'react'

export default function ProgrammingCountdown({ deadline, serverTime }: {
  deadline: number
  serverTime: number
}) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((deadline - serverTime) / 1000)))

  useEffect(() => {
    // Anchor server time to a monotonic clock, independent of the browser's wall clock.
    const localDeadline = performance.now() + (deadline - serverTime)
    const update = () => setSeconds(Math.max(0, Math.ceil((localDeadline - performance.now()) / 1000)))
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [deadline, serverTime])

  return (
    <p className="programming-countdown" role="timer" aria-label="Programming time remaining">
      Time remaining: {seconds}s
    </p>
  )
}
