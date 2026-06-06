"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KitPanel } from "./kit-panel";
import type { ColumnDTO } from "@/lib/columns";
import type { JobDetailDTO } from "@/lib/jobs";
import type { SavedKitDTO } from "@/lib/kits";

/**
 * Right-side drawer showing the full job: meta, listing text, notes,
 * move-column dropdown, and a placeholder Generate-Kit CTA (Phase 7).
 *
 * Open state is URL-driven (`?job=<id>`). The component renders nothing
 * when the param is absent, fetches lazily when it appears, and closes by
 * stripping the param.
 *
 * Notes are debounced-saved on blur to keep the UI calm.
 */
export function JobDetailDrawer({
  columns,
  profileReady,
}: {
  columns: ColumnDTO[];
  profileReady: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");

  const [job, setJob] = useState<JobDetailDTO | null>(null);
  const [kit, setKit] = useState<SavedKitDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Refresh local state whenever the URL points to a new job. When jobId is
  // null the dialog is closed (open={!!jobId}) so the stale `job` snapshot
  // isn't visible and doesn't need an explicit reset here.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    // Fetch job + kit in parallel — they're independent reads.
    const jobReq = fetch(`/api/jobs/${encodeURIComponent(jobId)}`).then(
      async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "Job not found." : `Failed (${res.status}).`,
          );
        }
        return (await res.json()) as { job: JobDetailDTO };
      },
    );
    const kitReq = fetch(`/api/jobs/${encodeURIComponent(jobId)}/kit`).then(
      async (res) => {
        if (!res.ok) return { kit: null };
        return (await res.json()) as { kit: SavedKitDTO | null };
      },
    );

    Promise.all([jobReq, kitReq])
      .then(([{ job: fetched }, { kit: fetchedKit }]) => {
        if (cancelled) return;
        setJob(fetched);
        setKit(fetchedKit);
        setNotes(fetched.notes ?? "");
        setLoadError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load job.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const close = useCallback(() => {
    // Drop the `job` param, keep everything else.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("job");
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [router, searchParams]);

  async function patch(input: Record<string, unknown>): Promise<JobDetailDTO> {
    if (!job) throw new Error("No job loaded.");
    const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Request failed (${res.status}).`);
    }
    const { job: updated } = (await res.json()) as { job: JobDetailDTO };
    return updated;
  }

  function moveColumn(toId: string) {
    if (!job || toId === job.columnId) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const next = await patch({ columnId: toId });
        setJob(next);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Move failed.");
      }
    });
  }

  function saveNotes() {
    if (!job) return;
    const trimmed = notes.trim();
    const current = (job.notes ?? "").trim();
    if (trimmed === current) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const next = await patch({ notes: trimmed });
        setJob(next);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function remove() {
    if (!job) return;
    if (!confirm(`Delete ${job.company} – ${job.role}?`)) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 204) {
          throw new Error(`Delete failed (${res.status}).`);
        }
        close();
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Delete failed.");
      }
    });
  }

  // Imperative blur handler — avoid stale state in onBlur capture.
  const notesRef = useRef<HTMLTextAreaElement>(null);

  return (
    <Dialog open={!!jobId} onOpenChange={(o) => !o && close()}>
      <DialogContent variant="drawer">
        <DialogHeader
          title={job ? `${job.company} — ${job.role}` : "Loading…"}
          description={
            job?.location ? job.location : loadError ? loadError : undefined
          }
        />

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {actionError && (
            <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
              {actionError}
            </div>
          )}

          {job && (
            <>
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-caption text-ink-subtle">
                    Column
                  </label>
                  <select
                    value={job.columnId}
                    onChange={(e) => moveColumn(e.target.value)}
                    disabled={pending}
                    className={selectCls}
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  {job.sourceUrl && (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-body-sm text-primary hover:text-primary-hover ml-2"
                    >
                      Open source ↗
                    </a>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-eyebrow text-ink-subtle uppercase mb-2">
                  Listing
                </h3>
                <pre className="whitespace-pre-wrap text-body-sm text-ink-muted bg-canvas border border-hairline rounded-md p-3 font-mono">
                  {job.listingText}
                </pre>
              </section>

              <section>
                <h3 className="text-eyebrow text-ink-subtle uppercase mb-2">
                  Notes
                </h3>
                <textarea
                  ref={notesRef}
                  className={textareaCls}
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Recruiter contact, salary range, follow-ups…"
                  disabled={pending}
                />
                <p className="text-caption text-ink-tertiary mt-1">
                  Saved on blur.
                </p>
              </section>

              <section>
                <h3 className="text-eyebrow text-ink-subtle uppercase mb-2">
                  Application kit
                </h3>
                <KitPanel
                  key={job.id}
                  jobId={job.id}
                  company={job.company}
                  role={job.role}
                  location={job.location}
                  initialKit={kit}
                  profileReady={profileReady}
                />
              </section>
            </>
          )}
        </div>

        {job && (
          <footer className="flex items-center justify-between gap-2 px-6 py-3 border-t border-hairline bg-surface-1">
            <Button
              variant="tertiary"
              onClick={remove}
              disabled={pending}
              className="text-ink-subtle hover:text-ink"
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Close
            </Button>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

const selectCls =
  "h-8 px-2 pr-7 rounded-md bg-canvas border border-hairline text-ink text-body-sm";

const textareaCls =
  "w-full px-3 py-2 rounded-md " +
  "bg-canvas text-ink text-body-sm " +
  "border border-hairline focus:border-hairline-strong " +
  "placeholder:text-ink-tertiary resize-y";
