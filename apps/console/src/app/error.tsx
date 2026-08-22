"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="center-state">
      <h1>Something went wrong</h1>
      <p>The control plane could not load this page.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
