"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  CompanyBrief,
  InterviewQuestion,
  KitContent,
  KitSectionKind,
} from "@/lib/ai/kit-tool";
import type { KitStreamEvent, SavedKitDTO, SavedKitSectionDTO } from "@/lib/kits";
import { sectionToMarkdown, kitToMarkdown } from "@/lib/kit-markdown";

/**
 * Kit panel shown inside the job-detail drawer.
 *
 * Two states:
 *   - No kit: big Generate-Kit CTA, with a disabled reason when prerequisites
 *     (empty profile / no API key) are missing.
 *   - Kit present: section tabs (Cover letter / Bullets / Questions / Brief)
 *     with the model output rendered shape-appropriately.
 *
 * Phase 9 will layer inline edit + per-section regenerate on top of the
 * same plumbing.
 */
const TABS: { kind: KitSectionKind; label: string }[] = [
  { kind: "cover_letter", label: "Cover letter" },
  { kind: "resume_bullets", label: "Bullets" },
  { kind: "interview_questions", label: "Questions" },
  { kind: "company_brief", label: "Brief" },
];

export function KitPanel({
  jobId,
  company,
  role,
  location,
  initialKit,
  profileReady,
  onDelete,
}: {
  jobId: string;
  company: string;
  role: string;
  location: string | null;
  initialKit: SavedKitDTO | null;
  profileReady: boolean;
  /**
   * Invoked when the user clicks Delete in the kit-panel top row.
   * Owned by the parent drawer so it can confirm, DELETE the job, close
   * the drawer, and refresh the board.
   */
  onDelete?: () => void;
}) {
  // Parent is expected to pass key={jobId} when remounting between jobs, so
  // initialKit is captured once per mount and local mutations (generate /
  // regenerate / edit) drive subsequent updates.
  const [kit, setKit] = useState<SavedKitDTO | null>(initialKit);
  const [active, setActive] = useState<KitSectionKind>("cover_letter");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState<Partial<KitContent> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(() => {
    setError(null);
    setPartial(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await fetch(
          `/api/jobs/${encodeURIComponent(jobId)}/kit/stream`,
          { method: "POST", signal: controller.signal },
        );
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `Generation failed (${res.status}).`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        // Read NDJSON: each line is one event.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let event: KitStreamEvent;
            try {
              event = JSON.parse(line) as KitStreamEvent;
            } catch {
              continue;
            }
            if (event.type === "partial") {
              setPartial(event.partial);
            } else if (event.type === "done") {
              setKit(event.kit);
              setPartial(null);
              setStreaming(false);
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Generation failed.");
        setPartial(null);
        setStreaming(false);
      }
    })();
  }, [jobId]);

  // No kit AND not currently streaming → show the Generate CTA.
  if (!kit && !streaming) {
    const disabled = !profileReady;
    return (
      <div className="rounded-lg border border-dashed border-hairline p-6 text-center space-y-3">
        <p className="text-body-sm text-ink-muted">
          No kit yet. Generate one tailored to this listing.
        </p>
        {error && <p className="text-body-sm text-ink">{error}</p>}
        <div className="flex items-center justify-center gap-2">
          <Button
            onClick={generate}
            disabled={disabled}
            title={
              !profileReady ? "Fill in your profile first (Profile page)" : undefined
            }
          >
            Generate kit
          </Button>
          {onDelete && (
            <Button
              variant="tertiary"
              onClick={onDelete}
              className="text-ink-subtle hover:text-ink"
              title="Delete this job"
            >
              Delete
            </Button>
          )}
        </div>
        {!profileReady && (
          <p className="text-caption text-ink-tertiary">
            Your profile is empty — the AI needs your résumé as context.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => setActive(t.kind)}
              className={cn(
                "h-7 px-2.5 rounded-md text-button transition-colors cursor-pointer",
                active === t.kind
                  ? "bg-surface-2 text-ink"
                  : "text-ink-subtle hover:text-ink hover:bg-surface-1",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {kit && !streaming && (
            <Button
              variant="tertiary"
              onClick={() => downloadFullKitMarkdown(kit, { company, role, location })}
              title="Download the full kit as Markdown"
            >
              ↓ .md
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={generate}
            disabled={streaming}
            title="Regenerate the full kit"
          >
            {streaming ? "Streaming…" : "Regenerate"}
          </Button>
          {onDelete && (
            <Button
              variant="tertiary"
              onClick={onDelete}
              disabled={streaming}
              className="text-ink-subtle hover:text-ink"
              title="Delete this job"
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* toLocaleString is locale-sensitive; suppress the SSR-vs-client
          hydration warning and let the client's format win. */}
      <p
        className="text-caption text-ink-tertiary flex items-center gap-2"
        suppressHydrationWarning
      >
        {streaming ? (
          <span className="text-[var(--color-primary)]">Generating…</span>
        ) : kit ? (
          <>
            Generated {new Date(kit.generatedAt).toLocaleString()} · {kit.model}
          </>
        ) : null}
      </p>

      {error && (
        <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-canvas p-4">
        {streaming ? (
          <PartialOrSavedView
            active={active}
            kit={kit}
            partial={partial}
            streaming={streaming}
          />
        ) : kit ? (
          <SectionShell
            jobId={jobId}
            company={company}
            role={role}
            kind={active}
            section={kit.sections.find((s) => s.kind === active)!}
            onSectionUpdated={(updated) => {
              setKit((prev) =>
                prev
                  ? {
                      ...prev,
                      sections: prev.sections.map((s) =>
                        s.kind === updated.kind ? updated : s,
                      ),
                    }
                  : prev,
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Per-section shell with view ↔ edit toggle, Revert, and Regenerate actions.

function SectionShell({
  jobId,
  company,
  role,
  kind,
  section,
  onSectionUpdated,
}: {
  jobId: string;
  company: string;
  role: string;
  kind: KitSectionKind;
  section: SavedKitSectionDTO;
  onSectionUpdated: (s: SavedKitSectionDTO) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "revert" | "regen" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const edited = section.editedContent !== null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(sectionToMarkdown(section));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Clipboard write failed.");
    }
  }

  async function save(edited: SavedKitSectionDTO["content"]) {
    setBusy("save");
    setErr(null);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/kit/section/${kind}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edited }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status}).`);
      }
      const { section: next } = (await res.json()) as {
        section: SavedKitSectionDTO;
      };
      onSectionUpdated(next);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function revert() {
    setBusy("revert");
    setErr(null);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/kit/section/${kind}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edited: null }),
        },
      );
      if (!res.ok) throw new Error(`Revert failed (${res.status}).`);
      const { section: next } = (await res.json()) as {
        section: SavedKitSectionDTO;
      };
      onSectionUpdated(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revert failed.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regen");
    setErr(null);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/kit/section/${kind}/regenerate`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Regenerate failed (${res.status}).`);
      }
      const { section: next } = (await res.json()) as {
        section: SavedKitSectionDTO;
      };
      onSectionUpdated(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Regenerate failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-caption text-ink-tertiary">
          {edited ? "Edited" : "Original"}
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {!editing && (
            <Button variant="tertiary" onClick={copy} disabled={!!busy}>
              {copied ? "Copied ✓" : "Copy"}
            </Button>
          )}
          {!editing && kind === "cover_letter" && (
            <a
              href={`/api/jobs/${encodeURIComponent(jobId)}/kit/cover-letter.pdf`}
              download
              className="inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-transparent text-ink hover:bg-surface-1 text-button transition-colors cursor-pointer"
            >
              ↓ PDF
            </a>
          )}
          {!editing && (
            <Button
              variant="tertiary"
              onClick={() => downloadSectionMarkdown(section, { company, role })}
              title="Download just this section as Markdown"
            >
              ↓ .md
            </Button>
          )}
          {!editing && (
            <Button
              variant="tertiary"
              onClick={() => setEditing(true)}
              disabled={!!busy}
            >
              Edit
            </Button>
          )}
          {edited && !editing && (
            <Button
              variant="tertiary"
              onClick={revert}
              disabled={!!busy}
              title="Discard your edits and restore the model output"
            >
              {busy === "revert" ? "Reverting…" : "Revert"}
            </Button>
          )}
          {!editing && (
            <Button
              variant="secondary"
              onClick={regenerate}
              disabled={!!busy}
              title="Regenerate this section; keeps the others as-is"
            >
              {busy === "regen" ? "Regenerating…" : "Regenerate"}
            </Button>
          )}
        </div>
      </div>

      {err && (
        <p className="text-body-sm text-ink">{err}</p>
      )}

      {editing ? (
        <SectionEditor
          kind={kind}
          initial={section.editedContent ?? section.content}
          busy={busy === "save"}
          onCancel={() => setEditing(false)}
          onSave={save}
        />
      ) : (
        <SectionView section={section} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SectionEditor — variant per kind:
//
//   cover_letter  → single textarea (markdown)
//   resume_bullets → 4 textareas, one per bullet
//   interview_questions / company_brief → JSON textarea, parsed on save.
//     Structured editors for these would be nicer but they're rarely the
//     piece the user wants to hand-tune — usually it's the cover letter
//     or one of the bullets.

function SectionEditor({
  kind,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  kind: KitSectionKind;
  initial: SavedKitSectionDTO["content"];
  busy: boolean;
  onSave: (v: SavedKitSectionDTO["content"]) => void;
  onCancel: () => void;
}) {
  if (kind === "cover_letter") {
    return <CoverLetterEditor initial={initial as string} busy={busy} onSave={onSave} onCancel={onCancel} />;
  }
  if (kind === "resume_bullets") {
    return <BulletsEditor initial={initial as string[]} busy={busy} onSave={onSave} onCancel={onCancel} />;
  }
  return <JsonEditor initial={initial} busy={busy} onSave={onSave} onCancel={onCancel} />;
}

function CoverLetterEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        rows={18}
        className="w-full px-3 py-2 rounded-md bg-surface-1 border border-hairline focus:border-hairline-strong text-body-sm text-ink resize-y min-h-[260px] font-sans"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => onSave(text)} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function BulletsEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string[];
  busy: boolean;
  onSave: (v: string[]) => void;
  onCancel: () => void;
}) {
  const [bullets, setBullets] = useState<string[]>(() =>
    initial.length === 4 ? [...initial] : [...initial, "", "", "", ""].slice(0, 4),
  );
  return (
    <div className="space-y-3">
      {bullets.map((b, i) => (
        <textarea
          key={i}
          rows={3}
          className="w-full px-3 py-2 rounded-md bg-surface-1 border border-hairline focus:border-hairline-strong text-body-sm text-ink resize-y"
          value={b}
          onChange={(e) => {
            const next = [...bullets];
            next[i] = e.target.value;
            setBullets(next);
          }}
          disabled={busy}
          placeholder={`Bullet ${i + 1}`}
        />
      ))}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(bullets.map((b) => b.trim()))}
          disabled={busy || bullets.some((b) => !b.trim())}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download helpers — pure client-side blob → anchor → click. No server roundtrip.

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function downloadSectionMarkdown(
  section: SavedKitSectionDTO,
  meta: { company: string; role: string },
) {
  const filename = `${slug(meta.company)}_${slug(meta.role)}_${section.kind}.md`;
  downloadBlob(filename, sectionToMarkdown(section), "text/markdown");
}

function downloadFullKitMarkdown(
  kit: SavedKitDTO,
  meta: { company: string; role: string; location: string | null },
) {
  const filename = `${slug(meta.company)}_${slug(meta.role)}_kit.md`;
  downloadBlob(filename, kitToMarkdown(kit, meta), "text/markdown");
}

// ---------------------------------------------------------------------------

function JsonEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: SavedKitSectionDTO["content"];
  busy: boolean;
  onSave: (v: SavedKitSectionDTO["content"]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  function save() {
    try {
      const parsed = JSON.parse(text);
      setParseError(null);
      onSave(parsed);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON.");
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-ink-subtle">
        Edit the JSON directly. The server will reject malformed shapes.
      </p>
      <textarea
        autoFocus
        rows={18}
        className="w-full px-3 py-2 rounded-md bg-surface-1 border border-hairline focus:border-hairline-strong text-body-sm text-ink resize-y min-h-[260px] font-mono"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        spellCheck={false}
      />
      {parseError && (
        <p className="text-caption text-ink">JSON error: {parseError}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Render either the saved section (preferred — it's persisted, validated, and
// includes editedContent) or the in-flight partial (when streaming). During
// stream, partial wins; once we get the `done` event we replace it with the
// saved kit.

function PartialOrSavedView({
  active,
  kit,
  partial,
  streaming,
}: {
  active: KitSectionKind;
  kit: SavedKitDTO | null;
  partial: Partial<KitContent> | null;
  streaming: boolean;
}) {
  if (streaming && partial) {
    const value = partial[active];
    if (value === undefined) {
      return (
        <p className="text-body-sm text-ink-tertiary italic">
          Waiting for this section…
        </p>
      );
    }
    return <PartialView kind={active} value={value} />;
  }
  if (!kit) return null;
  const section = kit.sections.find((s) => s.kind === active);
  return section ? <SectionView section={section} /> : null;
}

function PartialView({
  kind,
  value,
}: {
  kind: KitSectionKind;
  value: unknown;
}) {
  // Partial-json may give us half-formed strings or arrays — render
  // defensively rather than asserting on shape.
  switch (kind) {
    case "cover_letter":
      return (
        <pre className="whitespace-pre-wrap text-body-sm text-ink leading-relaxed font-sans">
          {typeof value === "string" ? value : ""}
        </pre>
      );
    case "resume_bullets":
      return (
        <ul className="list-disc pl-5 space-y-2 text-body-sm text-ink">
          {Array.isArray(value)
            ? (value as unknown[]).map((b, i) => (
                <li key={i}>{typeof b === "string" ? b : ""}</li>
              ))
            : null}
        </ul>
      );
    case "interview_questions":
      return (
        <ol className="list-decimal pl-5 space-y-4 text-body-sm text-ink">
          {Array.isArray(value)
            ? (value as Partial<InterviewQuestion>[]).map((q, i) => (
                <li key={i} className="space-y-1">
                  <p className="text-ink">{q?.question ?? ""}</p>
                  {q?.why_it_matters && (
                    <p className="text-ink-muted">
                      <span className="text-caption text-ink-subtle uppercase tracking-wide mr-2">
                        Why
                      </span>
                      {q.why_it_matters}
                    </p>
                  )}
                  {q?.approach && (
                    <p className="text-ink-muted">
                      <span className="text-caption text-ink-subtle uppercase tracking-wide mr-2">
                        Approach
                      </span>
                      {q.approach}
                    </p>
                  )}
                </li>
              ))
            : null}
        </ol>
      );
    case "company_brief": {
      const cb = (value ?? {}) as Partial<CompanyBrief>;
      return (
        <div className="space-y-4 text-body-sm text-ink">
          {cb.what_they_do && (
            <BriefField label="What they do" value={cb.what_they_do} />
          )}
          {Array.isArray(cb.recent_signals) && cb.recent_signals.length > 0 && (
            <BriefList
              label="Recent signals"
              items={cb.recent_signals as string[]}
            />
          )}
          {Array.isArray(cb.tech_stack_guesses) &&
            cb.tech_stack_guesses.length > 0 && (
              <BriefList
                label="Tech stack (guesses)"
                items={cb.tech_stack_guesses as string[]}
              />
            )}
          {cb.team_fit_angle && (
            <BriefField label="Team fit angle" value={cb.team_fit_angle} />
          )}
          {Array.isArray(cb.questions_to_ask) &&
            cb.questions_to_ask.length > 0 && (
              <BriefList
                label="Questions to ask them"
                items={cb.questions_to_ask as string[]}
              />
            )}
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------

function SectionView({ section }: { section: SavedKitSectionDTO }) {
  // Edited content takes precedence over original.
  const value = section.editedContent ?? section.content;

  switch (section.kind) {
    case "cover_letter":
      return <CoverLetterView text={value as string} />;
    case "resume_bullets":
      return <BulletsView bullets={value as string[]} />;
    case "interview_questions":
      return <QuestionsView questions={value as InterviewQuestion[]} />;
    case "company_brief":
      return <BriefView brief={value as CompanyBrief} />;
  }
}

function CoverLetterView({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap text-body-sm text-ink leading-relaxed font-sans">
      {text}
    </pre>
  );
}

function BulletsView({ bullets }: { bullets: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-2 text-body-sm text-ink">
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

function QuestionsView({ questions }: { questions: InterviewQuestion[] }) {
  // 1-based selected question index; null = no question expanded (default).
  const [selected, setSelected] = useState<number | null>(null);
  const anyHasAnswer = questions.some(
    (q) => q.sample_answer && q.sample_answer.trim(),
  );

  const active = selected !== null ? questions[selected - 1] : null;

  return (
    <div className="space-y-5">
      {/* Summary: clean numbered list of the 10 questions — no coaching
          labels. Click a pill below to see the full first-person answer. */}
      <ol className="list-decimal pl-5 space-y-3 text-body-sm text-ink marker:text-ink-tertiary">
        {questions.map((q, i) => (
          <li key={i} className="text-ink leading-relaxed">
            {q.question}
          </li>
        ))}
      </ol>

      {/* Pagination bar → click a number to expand its full answer below. */}
      <div className="border-t border-hairline pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-caption text-ink-subtle uppercase tracking-wide">
            Practice answers
          </p>
          {selected !== null && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-caption text-ink-subtle hover:text-ink transition-colors cursor-pointer"
            >
              Close
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {questions.map((_, i) => {
            const n = i + 1;
            const isActive = selected === n;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(isActive ? null : n)}
                className={cn(
                  "inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-md text-button transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary text-[var(--color-on-primary)]"
                    : "bg-surface-1 text-ink-subtle hover:text-ink hover:bg-surface-2 border border-hairline",
                )}
                aria-pressed={isActive}
              >
                {n}
              </button>
            );
          })}
        </div>

        {!anyHasAnswer && (
          <p className="text-caption text-ink-tertiary">
            This kit was generated before answers were added. Regenerate the
            Questions section to include a full spoken answer per question.
          </p>
        )}

        {active && (
          <QuestionDetail index={selected as number} q={active} />
        )}
      </div>
    </div>
  );
}

function QuestionDetail({
  index,
  q,
}: {
  index: number;
  q: InterviewQuestion;
}) {
  const hasAnswer = !!q.sample_answer && q.sample_answer.trim().length > 0;
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-5 space-y-4 text-body text-ink">
      <div>
        <p className="text-caption text-ink-subtle uppercase tracking-wide mb-2">
          Question {index}
        </p>
        <p className="text-body-lg text-ink leading-snug">{q.question}</p>
      </div>

      <div>
        <p className="text-caption text-ink-subtle uppercase tracking-wide mb-2">
          Your answer
        </p>
        {hasAnswer ? (
          <p className="text-ink whitespace-pre-wrap leading-relaxed">
            {q.sample_answer}
          </p>
        ) : (
          <p className="text-ink-tertiary italic">
            Not available on this kit — regenerate the Questions section.
          </p>
        )}
      </div>
    </div>
  );
}

function BriefView({ brief }: { brief: CompanyBrief }) {
  return (
    <div className="space-y-4 text-body-sm text-ink">
      <BriefField label="What they do" value={brief.what_they_do} />
      <BriefList label="Recent signals" items={brief.recent_signals} />
      <BriefList
        label="Tech stack (guesses)"
        items={brief.tech_stack_guesses}
      />
      <BriefField label="Team fit angle" value={brief.team_fit_angle} />
      <BriefList label="Questions to ask them" items={brief.questions_to_ask} />
    </div>
  );
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption text-ink-subtle uppercase tracking-wide mb-1">
        {label}
      </p>
      <p>{value}</p>
    </div>
  );
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return (
      <div>
        <p className="text-caption text-ink-subtle uppercase tracking-wide mb-1">
          {label}
        </p>
        <p className="text-ink-tertiary">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-caption text-ink-subtle uppercase tracking-wide mb-1">
        {label}
      </p>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
