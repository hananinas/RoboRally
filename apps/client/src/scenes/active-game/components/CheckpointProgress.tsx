export default function CheckpointProgress({ collected, total }: { collected: number; total: number }) {
  return (
    <span className="checkpoint-progress" role="img" aria-label={`${collected} of ${total} checkpoints collected`}>
      {total > 0 && (
        <span className="checkpoint-progress__flags" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <svg
              key={index}
              className="checkpoint-progress__flag"
              data-collected={index < collected || undefined}
              viewBox="0 0 20 20"
              focusable="false"
            >
              <path d="M4 17V3m0 1h12l-2.5 4 2.5 4H4" />
            </svg>
          ))}
        </span>
      )}
      <span className="checkpoint-progress__count">{collected}/{total}</span>
    </span>
  )
}
