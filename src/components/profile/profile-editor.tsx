"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
  const [uploading, setUploading] = useState(false);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so re-picking the same file still fires onChange.
    event.target.value = "";
    if (!file) return;
    setError(null);
    setUploadHint(null);

    // Guard against clobbering hand-typed text without a warning.
    if (
      resumeText.trim() &&
      !confirm(
        "Replace the current résumé text with the extracted content from this file?",
      )
    ) {
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/extract-resume", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Extraction failed (${res.status}).`);
      }
      const { text, warnings } = (await res.json()) as {
        text: string;
        warnings: string[];
      };
      setResumeText(text);
      setUploadHint(
        `Loaded ${file.name} (${(file.size / 1024).toFixed(0)} KB).` +
          (warnings.length
            ? ` Note: ${warnings.slice(0, 2).join("; ")}`
            : " Review the text below and click Save profile."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setUploading(false);
    }
  }

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

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-caption text-ink-subtle">Résumé</span>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={onFilePicked}
            />
            <Button
              variant="secondary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending || uploading}
              title="Extract text from a PDF or Word file into the field below"
            >
              {uploading ? "Extracting…" : "Upload .pdf or .docx"}
            </Button>
          </div>
        </div>

        {uploadHint && (
          <p className="text-caption text-ink-subtle">{uploadHint}</p>
        )}

        <textarea
          id="resume"
          rows={14}
          className={inputCls + " resize-y min-h-[260px] font-mono text-body-sm"}
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          disabled={pending || uploading}
          placeholder="Paste your résumé text here, or use the Upload button above."
        />

        <p className="text-caption text-ink-tertiary">
          The AI uses this verbatim as context for every kit.
        </p>
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
        {/*
          Date formatting is locale-sensitive; server's `en-US` output will
          usually differ from the client's locale. Suppress the hydration
          warning here — the client's version is the one we want.
        */}
        <p className="text-caption text-ink-tertiary" suppressHydrationWarning>
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
