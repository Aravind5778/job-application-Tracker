"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SearchConfig } from "@/lib/search/config";

/**
 * "Find new jobs" modal.
 *
 * Reads the currently-saved SearchConfig, shows a summary, and lets the
 * user kick off a search. The POST call runs 30–90 seconds (ATS feeds +
 * grounded search + scoring), so we show a spinner + reassuring line.
 * Top-3 kits are auto-generated in the background on the server after
 * the response returns, so the modal doesn't need to wait for them.
 */
type SearchResult = {
  ok: boolean;
  error?: string;
  totals: {
    atsFetched: number;
    groundedFetched: number;
    afterDedup: number;
    inserted: number;
    autoKitQueued: number;
  };
  atsErrors: Array<{ feed: string; error: string }>;
  groundedErrors: Array<{ query: string; error: string }>;
  inserted: Array<{
    company: string;
    role: string;
    location: string | null;
    score: number;
    reason: string;
    jobId: string;
  }>;
};

export function FindJobsModal({ config }: { config: SearchConfig }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setResult(null);
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (!next && pending) return; // don't close mid-search
    setOpen(next);
    if (!next) {
      reset();
      // Refresh the board so newly-inserted Suggested cards show up.
      router.refresh();
    }
  }

  function runSearch() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/search", { method: "POST" });
        const data = (await res.json()) as SearchResult;
        if (!data.ok) {
          setError(data.error ?? `Search failed (${res.status}).`);
          setResult(data);
          return;
        }
        setResult(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed.");
      }
    });
  }

  const canRun =
    config.atsFeeds.length > 0 ||
    config.savedQueries.length > 0 ||
    // Even with nothing configured, we can try to derive a query from the profile.
    true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          title="Find new jobs matching your profile"
        >
          Find jobs
        </Button>
      </DialogTrigger>

      <DialogContent variant="modal">
        <DialogHeader
          title="Find new jobs"
          description={
            pending
              ? "Running — this can take up to a minute."
              : result
                ? "Search complete."
                : "Pulls fresh postings from your ATS feeds and Google-grounded search, scores each against your profile, and drops the matches into a Suggested column."
          }
        />

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
              {error}
            </div>
          )}

          {!pending && !result && (
            <ConfigSummary config={config} />
          )}

          {pending && <RunningIndicator />}

          {result && !error && <ResultSummary result={result} />}
        </div>

        <footer className="flex items-center justify-between gap-2 px-6 py-3 border-t border-hairline bg-surface-1">
          <div>
            {result?.inserted.length ? (
              <span className="text-caption text-ink-subtle">
                Auto-kit queued for top {result.totals.autoKitQueued} · finishes in the background
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                {result ? "Close" : "Cancel"}
              </Button>
            </DialogClose>
            {!result && (
              <Button
                type="button"
                variant="primary"
                onClick={runSearch}
                disabled={pending || !canRun}
              >
                {pending ? "Searching…" : "Search now"}
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ConfigSummary({ config }: { config: SearchConfig }) {
  const bits: Array<{ label: string; value: string }> = [];
  if (config.location) bits.push({ label: "Location", value: config.location });
  if (config.seniority)
    bits.push({ label: "Seniority", value: config.seniority });
  bits.push({ label: "Recency", value: `Last ${config.recencyDays} days` });
  bits.push({
    label: "Saved queries",
    value:
      config.savedQueries.length > 0
        ? `${config.savedQueries.length} configured`
        : "None — will derive from your profile background",
  });
  bits.push({
    label: "ATS feeds",
    value:
      config.atsFeeds.length > 0
        ? config.atsFeeds
            .map((f) => `${f.source}:${f.slug}`)
            .join(", ")
        : "None",
  });

  return (
    <div className="space-y-2">
      <p className="text-caption text-ink-subtle uppercase tracking-wide">
        Using current search settings
      </p>
      <dl className="rounded-lg border border-hairline bg-surface-1 divide-y divide-hairline">
        {bits.map((b) => (
          <div
            key={b.label}
            className="flex items-baseline gap-3 px-3 py-2 text-body-sm"
          >
            <dt className="text-ink-subtle w-32 shrink-0">{b.label}</dt>
            <dd className="text-ink truncate">{b.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-ink-tertiary">
        Change these in Settings → Job search.
      </p>
    </div>
  );
}

function RunningIndicator() {
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-6 text-center space-y-2">
      <p className="text-body-sm text-ink">Searching…</p>
      <p className="text-caption text-ink-tertiary">
        Polling ATS feeds, running the grounded search, then scoring each
        candidate. Kits for the top 3 matches will generate in the background
        after this returns.
      </p>
    </div>
  );
}

function ResultSummary({ result }: { result: SearchResult }) {
  const {
    totals,
    inserted,
    atsErrors,
    groundedErrors,
  } = result;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="From ATS feeds" value={totals.atsFetched} />
        <Stat label="From grounded search" value={totals.groundedFetched} />
        <Stat label="After dedup" value={totals.afterDedup} />
        <Stat
          label="Added to Suggested"
          value={totals.inserted}
          emphasize
        />
      </div>

      {inserted.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface-1">
          <p className="text-caption text-ink-subtle uppercase tracking-wide px-3 pt-3">
            New in Suggested (ranked)
          </p>
          <ul className="divide-y divide-hairline">
            {inserted.map((c, i) => (
              <li
                key={c.jobId}
                className="flex items-baseline gap-3 px-3 py-2 text-body-sm"
              >
                <span className="text-caption text-ink-tertiary tabular-nums w-6">
                  {i + 1}
                </span>
                <span className="text-caption text-ink-subtle w-10 tabular-nums">
                  {c.score}
                </span>
                <span className="flex-1 truncate">
                  <span className="text-ink">{c.company}</span>
                  <span className="text-ink-subtle"> — {c.role}</span>
                  {c.location && (
                    <span className="text-ink-tertiary"> · {c.location}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(atsErrors.length > 0 || groundedErrors.length > 0) && (
        <details className="text-caption text-ink-subtle">
          <summary className="cursor-pointer">
            Source errors ({atsErrors.length + groundedErrors.length})
          </summary>
          <ul className="mt-1 space-y-1 pl-4 list-disc">
            {atsErrors.map((e, i) => (
              <li key={`ats-${i}`}>
                <code>{e.feed}</code>: {e.error}
              </li>
            ))}
            {groundedErrors.map((e, i) => (
              <li key={`gr-${i}`}>
                <code>{e.query}</code>: {e.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-md border border-hairline bg-canvas px-3 py-2">
      <div
        className={
          emphasize
            ? "text-card-title text-[var(--color-success)] tabular-nums"
            : "text-card-title text-ink tabular-nums"
        }
      >
        {value}
      </div>
      <div className="text-caption text-ink-subtle">{label}</div>
    </div>
  );
}
