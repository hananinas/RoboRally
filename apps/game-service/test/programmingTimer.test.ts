import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createProgrammingTimer } from '@/programmingTimer'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('starts once and finalizes before publishing CLOSED at the deadline', () => {
  const events: string[] = []
  const timer = createProgrammingTimer({
    onChange: (state) => events.push(state.status),
    onExpire: () => {
      expect(timer.state()).toEqual({ status: 'CLOSED' })
      events.push('finalized')
    },
  })
  expect(timer.state()).toEqual({ status: 'IDLE' })
  timer.start()
  vi.advanceTimersByTime(10_000)
  timer.start()
  expect(timer.state()).toEqual({ status: 'RUNNING', deadline: 30_000 })
  vi.setSystemTime(29_999)
  expect(timer.expireIfDue()).toBe(false)
  vi.setSystemTime(30_000)
  expect(timer.expireIfDue()).toBe(true)
  vi.advanceTimersByTime(30_000)
  expect(events).toEqual(['RUNNING', 'finalized', 'CLOSED'])
})

it('cancels early closure and starts a new round with a new deadline', () => {
  const onExpire = vi.fn()
  const timer = createProgrammingTimer({ onExpire, onChange: vi.fn() })
  timer.start()
  timer.close()
  vi.advanceTimersByTime(30_000)
  expect(onExpire).not.toHaveBeenCalled()
  timer.reset()
  timer.start()
  expect(timer.state()).toEqual({ status: 'RUNNING', deadline: 60_000 })
  vi.advanceTimersByTime(30_000)
  expect(onExpire).toHaveBeenCalledOnce()
})

it('stops permanently without completing programs', () => {
  const onExpire = vi.fn()
  const timer = createProgrammingTimer({ onExpire, onChange: vi.fn() })
  timer.start()
  timer.stop()
  timer.reset()
  timer.start()
  vi.advanceTimersByTime(60_000)
  expect(onExpire).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
