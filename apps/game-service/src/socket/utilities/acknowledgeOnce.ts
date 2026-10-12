export function withAcknowledgeOnce<R>(
  acknowledge: ((result: R) => void) | undefined,
  run: (ack: (result: R) => void) => void,
  onError: (error: unknown, alreadyAcknowledged: boolean) => R,
): void {
  if (typeof acknowledge !== 'function') return
  let fired = false
  const ack = (result: R): void => {
    if (fired) return
    fired = true
    acknowledge(result)
  }
  try {
    run(ack)
  } catch (error) {
    ack(onError(error, fired))
  }
}
