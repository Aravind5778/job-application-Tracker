"use client";

/**
 * App-wide error boundary. Next.js calls this whenever a server or client
 * render throws under any route. We keep it deliberately quiet — same dark
 * surface as the rest of the app, the actual error message, and a Reset
 * button that retries the segment.
 */
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in dev so it's not just hidden behind the boundary UI.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="max-w-[520px] w-full rounded-lg border border-hairline bg-surface-1 p-6 space-y-4">
        <p className="text-eyebrow text-ink-subtle uppercase">Error</p>
        <h1 className="text-card-title text-ink">Something broke</h1>
        <p className="text-body-sm text-ink-muted whitespace-pre-wrap">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="text-caption text-ink-tertiary">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => location.reload()}>
            Reload
          </Button>
          <Button onClick={() => reset()}>Retry</Button>
        </div>
      </div>
    </main>
  );
}
