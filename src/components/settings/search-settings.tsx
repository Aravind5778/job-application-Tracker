"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AtsFeed, AtsSource, SearchConfig } from "@/lib/search/config";

/**
 * Settings editor for the automatic job-search feature. Persists via
 * PATCH /api/search/settings. Fields:
 *   - Location preference (free text)
 *   - Seniority hint (free text)
 *   - Recency (max age of postings in days)
 *   - Saved queries (multi-line; one query per line)
 *   - ATS feeds (list of { source, slug, label }) — polls
 *     Greenhouse/Lever/Ashby company boards directly, alongside the
 *     Gemini grounded search.
 */
export function SearchSettings({ initial }: { initial: SearchConfig }) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [location, setLocation] = useState(initial.location);
  const [seniority, setSeniority] = useState(initial.seniority);
  const [recencyDays, setRecencyDays] = useState(initial.recencyDays);
  const [savedQueriesText, setSavedQueriesText] = useState(
    initial.savedQueries.join("\n"),
  );
  const [feeds, setFeeds] = useState<AtsFeed[]>(initial.atsFeeds);
  const [draftSource, setDraftSource] = useState<AtsSource>("greenhouse");
  const [draftSlug, setDraftSlug] = useState("");
  const [draftLabel, setDraftLabel] = useState("");

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const body: SearchConfig = {
          location,
          seniority,
          recencyDays,
          savedQueries: savedQueriesText
            .split("\n")
            .map((q) => q.trim())
            .filter(Boolean),
          atsFeeds: feeds,
        };
        const res = await fetch("/api/search/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Save failed (${res.status}).`);
        }
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function addFeed() {
    const slug = draftSlug.trim();
    if (!slug) return;
    if (feeds.some((f) => f.source === draftSource && f.slug === slug)) return;
    setFeeds([
      ...feeds,
      { source: draftSource, slug, label: draftLabel.trim() || undefined },
    ]);
    setDraftSlug("");
    setDraftLabel("");
  }

  function removeFeed(idx: number) {
    setFeeds(feeds.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Row label="Location preference" hint='e.g. "Remote (US)" or "Bangalore, Hyderabad, or EST-compatible remote"'>
          <input
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            disabled={pending}
            placeholder="Remote"
          />
        </Row>
        <Row label="Seniority" hint='e.g. "Senior" or "Staff/Senior"'>
          <input
            className={inputCls}
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
            maxLength={100}
            disabled={pending}
            placeholder="Senior"
          />
        </Row>
      </div>

      <Row
        label="Max age of postings"
        hint="Reject anything older than this many days."
      >
        <input
          type="number"
          min={1}
          max={90}
          className={inputCls + " w-32"}
          value={recencyDays}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setRecencyDays(n);
          }}
          disabled={pending}
        />
      </Row>

      <Row
        label="Saved queries"
        hint="One per line. Leave empty to auto-derive from your profile background."
      >
        <textarea
          rows={4}
          className={inputCls + " min-h-[100px] font-mono text-body-sm"}
          value={savedQueriesText}
          onChange={(e) => setSavedQueriesText(e.target.value)}
          disabled={pending}
          placeholder={"Senior DevOps engineer, remote US\nStaff platform engineer, EMEA"}
        />
      </Row>

      <section className="space-y-2">
        <div>
          <p className="text-caption text-ink-subtle">
            ATS feeds
          </p>
          <p className="text-caption text-ink-tertiary">
            Polled directly for their company boards — no LLM cost per job.
            Alongside the grounded search, not instead of it.
          </p>
        </div>

        {feeds.length > 0 && (
          <ul className="rounded-lg border border-hairline bg-surface-1 divide-y divide-hairline">
            {feeds.map((f, i) => (
              <li
                key={`${f.source}:${f.slug}:${i}`}
                className="flex items-center gap-3 px-3 py-2 text-body-sm"
              >
                <span className="text-caption text-ink-subtle uppercase w-20">
                  {f.source}
                </span>
                <span className="flex-1 text-ink truncate">
                  {f.label ? `${f.label} — ` : ""}
                  <code className="text-ink-muted">{f.slug}</code>
                </span>
                <button
                  type="button"
                  onClick={() => removeFeed(i)}
                  disabled={pending}
                  aria-label={`Remove ${f.source}:${f.slug}`}
                  className="text-ink-subtle hover:text-ink cursor-pointer text-body-sm"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-subtle">Source</span>
            <select
              value={draftSource}
              onChange={(e) => setDraftSource(e.target.value as AtsSource)}
              className={inputCls + " pr-8"}
              disabled={pending}
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-caption text-ink-subtle">Company slug</span>
            <input
              className={inputCls}
              value={draftSlug}
              onChange={(e) => setDraftSlug(e.target.value)}
              disabled={pending}
              placeholder={
                draftSource === "greenhouse"
                  ? "stripe (from boards.greenhouse.io/stripe)"
                  : draftSource === "lever"
                    ? "netflix (from jobs.lever.co/netflix)"
                    : "linear (from jobs.ashbyhq.com/linear)"
              }
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeed())}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span className="text-caption text-ink-subtle">Display name (optional)</span>
            <input
              className={inputCls}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              disabled={pending}
              placeholder={draftSlug || "Company name"}
            />
          </label>
          <Button
            variant="secondary"
            type="button"
            onClick={addFeed}
            disabled={pending || !draftSlug.trim()}
          >
            Add feed
          </Button>
        </div>
      </section>

      <footer className="flex items-center justify-end gap-3 pt-2 border-t border-hairline">
        {savedAt && (
          <span className="text-body-sm text-[var(--color-success)]">
            Saved ✓
          </span>
        )}
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save search settings"}
        </Button>
      </footer>
    </div>
  );
}

const inputCls =
  "w-full h-9 px-3 rounded-md " +
  "bg-canvas text-ink text-body-sm " +
  "border border-hairline focus:border-hairline-strong " +
  "placeholder:text-ink-tertiary disabled:opacity-60";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5")}>
      <span className="text-caption text-ink-subtle">{label}</span>
      {children}
      {hint && <span className="text-caption text-ink-tertiary">{hint}</span>}
    </label>
  );
}
