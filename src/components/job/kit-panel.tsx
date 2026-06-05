"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  CompanyBrief,
  InterviewQuestion,
  KitSectionKind,
} from "@/lib/ai/kit-tool";
import type { SavedKitDTO, SavedKitSectionDTO } from "@/lib/kits";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/kit`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Generation failed (${res.status}).`);
        }
        const { kit: generated } = (await res.json()) as { kit: SavedKitDTO };
        setKit(generated);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed.");
      }
    });
  }, [jobId]);

  if (!kit) {
    const disabled = !profileReady || pending;
    return (
      <div className="rounded-lg border border-dashed border-hairline p-6 text-center space-y-3">
        <p className="text-body-sm text-ink-muted">
          {pending
            ? "Generating… (≈10–30s on Opus)"
            : "No kit yet. Generate one tailored to this listing."}
        </p>
        {error && (
          <p className="text-body-sm text-ink">{error}</p>
        )}
        <Button
          onClick={generate}
          disabled={disabled}
          title={
            !profileReady
              ? "Fill in your profile first (Profile page)"
              : pending
                ? "Generating…"
                : undefined
          }
        >
          {pending ? "Generating…" : "Generate kit"}
        </Button>
        {!profileReady && (
          <p className="text-caption text-ink-tertiary">
            Your profile is empty — the AI needs your résumé as context.
          </p>
        )}
      </div>
    );
  }

  const section = kit.sections.find((s) => s.kind === active);

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
          disabled={pending}
          title="Regenerate the full kit"
        >
          {pending ? "Regenerating…" : "Regenerate"}
        </Button>
      </div>

      <p className="text-caption text-ink-tertiary">
        Generated {new Date(kit.generatedAt).toLocaleString()} · {kit.model}
      </p>

      {error && (
        <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-canvas p-4">
        {section ? <SectionView section={section} /> : null}
      </div>
    </div>
  );
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
