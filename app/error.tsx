'use client'

/** Route-level boundary: a render/data failure gets a retry, not a white page. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error(error)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl">Something went sideways.</h1>
      <p className="mt-3 text-ink-soft">
        Your pet is fine — the stats live on the server. Try again in a moment.
      </p>
      <button type="button" onClick={reset} className="pixel-btn pixel-btn-primary mt-6">
        Try again
      </button>
    </main>
  )
}
