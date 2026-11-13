import type { ProgrammingTimer as ProgrammingTimerState } from '@robo-rally/game-events'

export type { ProgrammingTimerState }

export type ProgrammingTimer = {
  state: () => ProgrammingTimerState
  start: () => void
  close: () => void
  reset: () => void
  expireIfDue: () => boolean
  stop: () => void
}

export function createProgrammingTimer({ onExpire, onChange }: {
  onExpire: () => void
  onChange: (state: ProgrammingTimerState) => void
}): ProgrammingTimer {
  let state: ProgrammingTimerState = Object.freeze({ status: 'IDLE' })
  let scheduledExpiry: NodeJS.Timeout | undefined
  let stopped = false

  function clearScheduledExpiry(): void {
    clearTimeout(scheduledExpiry)
    scheduledExpiry = undefined
  }

  function expireIfDue(): boolean {
    if (stopped || state.status !== 'RUNNING' || Date.now() < state.deadline) return false
    clearScheduledExpiry()
    const closed = Object.freeze({ status: 'CLOSED' } as const)
    state = closed
    onExpire()
    if (!stopped && state === closed) onChange(closed)
    return true
  }

  function scheduleExpiry(): void {
    const running = state
    if (stopped || running.status !== 'RUNNING') return
    scheduledExpiry = setTimeout(() => {
      if (stopped || state !== running) return
      // Recheck the deadline in case the server clock moved back.
      if (!expireIfDue()) scheduleExpiry()
    }, Math.max(0, running.deadline - Date.now()))
  }

  function start(): void {
    if (stopped || state.status !== 'IDLE') return
    state = Object.freeze({ status: 'RUNNING', deadline: Date.now() + 30_000 })
    scheduleExpiry()
    onChange(state)
  }

  function close(): void {
    if (stopped || state.status === 'CLOSED') return
    clearScheduledExpiry()
    state = Object.freeze({ status: 'CLOSED' })
    onChange(state)
  }

  function reset(): void {
    if (stopped || state.status === 'IDLE') return
    clearScheduledExpiry()
    state = Object.freeze({ status: 'IDLE' })
    onChange(state)
  }

  function stop(): void {
    stopped = true
    clearScheduledExpiry()
    state = Object.freeze({ status: 'CLOSED' })
  }

  return { state: () => state, start, close, reset, expireIfDue, stop }
}
