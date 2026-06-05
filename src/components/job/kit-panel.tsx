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
  initialKit,
  profileReady,
}: {
  jobId: string;
  initialKit: SavedKitDTO | null;
  profileReady: boolean;
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
        <Button
          onClick={generate}
          disabled={disabled}
          title={
            !profileReady ? "Fill in your profile first (Profile page)" : undefined
          }
        >
          Generate kit
        </Button>
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
        <Button
          variant="secondary"
          onClick={generate}
          disabled={streaming}
          title="Regenerate the full kit"
        >
          {streaming ? "Streaming…" : "Regenerate"}
        </Button>
      </div>

      <p className="text-caption text-ink-tertiary flex items-center gap-2">
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
        <PartialOrSavedView
          active={active}
          kit={kit}
          partial={partial}
          streaming={streaming}
        />
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
  return (
    <ol className="list-decimal pl-5 space-y-4 text-body-sm text-ink">
      {questions.map((q, i) => (
        <li key={i} className="space-y-1">
          <p className="text-ink">{q.question}</p>
          <p className="text-ink-muted">
            <span className="text-caption text-ink-subtle uppercase tracking-wide mr-2">
              Why
            </span>
            {q.why_it_matters}
          </p>
          <p className="text-ink-muted">
            <span className="text-caption text-ink-subtle uppercase tracking-wide mr-2">
              Approach
            </span>
            {q.approach}
          </p>
        </li>
      ))}
    </ol>
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
