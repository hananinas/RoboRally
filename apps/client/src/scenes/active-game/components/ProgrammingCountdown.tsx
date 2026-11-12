import { useEffect, useState } from 'react'

export default function ProgrammingCountdown({ localDeadline }: {
  localDeadline: number
}) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((localDeadline - performance.now()) / 1000)))

  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((localDeadline - performance.now()) / 1000)))
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [localDeadline])

  return (
    <p className="programming-countdown" role="timer" aria-label="Programming time remaining">
      Time remaining: {seconds}s
    </p>
  )
}
