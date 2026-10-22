import { describe, expect, it, vi } from 'vitest'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'

describe('withAcknowledgeOnce', () => {
  it('does nothing when acknowledge is not a function', () => {
    const run = vi.fn()
    const onError = vi.fn()
    withAcknowledgeOnce(undefined, run, onError)
    expect(run).not.toHaveBeenCalled()
  })

  it('acknowledges exactly once for a normal result', () => {
    const acknowledge = vi.fn()
    withAcknowledgeOnce(acknowledge, (ack) => ack('ok'), () => 'unreachable')
    expect(acknowledge).toHaveBeenCalledTimes(1)
    expect(acknowledge).toHaveBeenCalledWith('ok')
  })

  it('falls back to onError when run throws before acknowledging', () => {
    const acknowledge = vi.fn()
    const onError = vi.fn((_error: unknown, alreadyAcknowledged: boolean) => {
      expect(alreadyAcknowledged).toBe(false)
      return 'fallback'
    })
    withAcknowledgeOnce(acknowledge, () => { throw new Error('boom') }, onError)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(acknowledge).toHaveBeenCalledTimes(1)
    expect(acknowledge).toHaveBeenCalledWith('fallback')
  })

  it('does not acknowledge a second time when run throws after already acknowledging', () => {
    const acknowledge = vi.fn()
    const onError = vi.fn((_error: unknown, alreadyAcknowledged: boolean) => {
      expect(alreadyAcknowledged).toBe(true)
      return 'fallback'
    })
    withAcknowledgeOnce(acknowledge, (ack) => {
      ack('ok')
      throw new Error('boom after acknowledging')
    }, onError)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(acknowledge).toHaveBeenCalledTimes(1)
    expect(acknowledge).toHaveBeenCalledWith('ok')
  })

  it('ignores a second explicit ack call from within run', () => {
    const acknowledge = vi.fn()
    withAcknowledgeOnce(acknowledge, (ack) => {
      ack('first')
      ack('second')
    }, () => 'unreachable')
    expect(acknowledge).toHaveBeenCalledTimes(1)
    expect(acknowledge).toHaveBeenCalledWith('first')
  })
})
