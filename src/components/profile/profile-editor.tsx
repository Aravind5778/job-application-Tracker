"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ProfileDTO } from "@/lib/profile";

/**
 * Profile editor. Held entirely in local state until the user saves —
 * the AI doesn't pick up changes until they're persisted, so optimistic
 * "save on blur" would only confuse things.
 */
export function ProfileEditor({ initial }: { initial: ProfileDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [resumeText, setResumeText] = useState(initial.resumeText);
  const [backgroundNote, setBackgroundNote] = useState(initial.backgroundNote);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            email,
            resumeText,
            backgroundNote,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Save failed (${res.status}).`);
        }
        const { profile } = (await res.json()) as { profile: ProfileDTO };
        setSavedAt(profile.updatedAt);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Row label="Full name" htmlFor="fullName">
          <input
            id="fullName"
            className={inputCls}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            disabled={pending}
            placeholder="Aravind ___"
          />
        </Row>
        <Row label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            disabled={pending}
          />
        </Row>
      </section>

      <section>
        <Row label="Résumé" htmlFor="resume" hint="Paste your full résumé. The AI uses this verbatim as context for every kit.">
          <textarea
            id="resume"
            rows={14}
            className={inputCls + " resize-y min-h-[260px] font-mono text-body-sm"}
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            disabled={pending}
            placeholder="Paste your résumé text here."
          />
        </Row>
      </section>

      <section>
        <Row
          label="Background note"
          htmlFor="bg"
          hint="One or two paragraphs about target roles, geographic constraints, and what you're looking for next. The AI uses this to angle the cover letter."
        >
          <textarea
            id="bg"
            rows={6}
            className={inputCls + " resize-y min-h-[140px]"}
            value={backgroundNote}
            onChange={(e) => setBackgroundNote(e.target.value)}
            disabled={pending}
            placeholder="e.g. Looking for senior cloud / SRE / platform roles, EST hours, ideally remote-first; strong on Kubernetes, Terraform, GCP…"
          />
        </Row>
      </section>

      <footer className="flex items-center justify-between gap-3 pt-2 border-t border-hairline">
        <p className="text-caption text-ink-tertiary">
          {savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : "Not saved yet"}
        </p>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </footer>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-md " +
  "bg-canvas text-ink text-body-sm " +
  "border border-hairline focus:border-hairline-strong " +
  "placeholder:text-ink-tertiary disabled:opacity-60";

function Row({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-caption text-ink-subtle">{label}</span>
      {children}
      {hint && <span className="text-caption text-ink-tertiary">{hint}</span>}
    </label>
  );
}
