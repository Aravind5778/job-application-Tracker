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
import { cn } from "@/lib/cn";
import type { ColumnDTO } from "@/lib/columns";

/**
 * Add-job modal with two ingest tabs:
 *
 *   URL   — paste a job posting link; server fetches + extracts via
 *           JSON-LD (Greenhouse/Lever/Ashby) → Mozilla Readability fallback.
 *           Pre-fills the form on success; gracefully degrades to the Paste
 *           tab when the site blocks fetching (LinkedIn, Workday, etc).
 *
 *   Paste — drop the listing text in; an optional Haiku meta-extract
 *           guesses company/role from the first few hundred chars.
 *
 * Both tabs share the same review-and-save form below.
 */
type Tab = "url" | "paste";

type ParseResult = {
  ok: true;
  company?: string;
  role?: string;
  location?: string;
  listingText: string;
  sourceUrl?: string;
  extractor: "jsonld" | "readability" | "haiku" | "none";
  warning?: string;
};

export function AddJobModal({ columns }: { columns: ColumnDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("url");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Tab inputs.
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");

  // Shared review form (shown after either tab successfully extracts).
  const [reviewing, setReviewing] = useState(false);
  const [columnId, setColumnId] = useState(columns[0]?.id ?? "");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [listingText, setListingText] = useState("");
  const [source, setSource] = useState<"url" | "paste">("paste");

  function resetAll() {
    setTab("url");
    setError(null);
    setHint(null);
    setUrlInput("");
    setTextInput("");
    setReviewing(false);
    setColumnId(columns[0]?.id ?? "");
    setCompany("");
    setRole("");
    setLocation("");
    setSourceUrl("");
    setListingText("");
    setSource("paste");
  }

  function onOpenChange(next: boolean) {
    if (!next && pending) return;
    setOpen(next);
    if (!next) resetAll();
  }

  function applyParseResult(r: ParseResult, srcTab: Tab) {
    setCompany(r.company ?? "");
    setRole(r.role ?? "");
    setLocation(r.location ?? "");
    setListingText(r.listingText);
    setSourceUrl(r.sourceUrl ?? "");
    setSource(srcTab === "url" ? "url" : "paste");
    setHint(r.warning ?? null);
    setReviewing(true);
  }

  function parseUrl() {
    if (!urlInput.trim()) return;
    setError(null);
    setHint(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/parse-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        const data = (await res.json()) as ParseResult | {
          ok: false;
          error: string;
          code?: string;
        };
        if (!data.ok) {
          setError(data.error);
          if (data.code === "fetch_blocked") {
            // Hand the URL to the Paste tab so the user can copy-paste from
            // their browser without losing context.
            setSourceUrl(urlInput.trim());
            setTab("paste");
          }
          return;
        }
        applyParseResult(data, "url");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fetch failed.");
      }
    });
  }

  function parseText() {
    const cleaned = textInput.trim();
    if (cleaned.length < 40) {
      setError("Paste at least a few sentences of the listing.");
      return;
    }
    setError(null);
    setHint(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/parse-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleaned }),
        });
        const data = (await res.json()) as ParseResult | {
          ok: false;
          error: string;
        };
        if (!data.ok) {
          setError(data.error);
          return;
        }
        applyParseResult(data, "paste");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Extraction failed.");
      }
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId,
            company,
            role,
            location: location || undefined,
            source,
            sourceUrl: sourceUrl || undefined,
            listingText,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `Request failed (${res.status}).`);
        }
        setOpen(false);
        resetAll();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  const noColumns = columns.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="primary"
          disabled={noColumns}
          data-shortcut="add-job"
          title={noColumns ? "Add a column in Settings first" : "Add a job (n)"}
        >
          Add job
        </Button>
      </DialogTrigger>

      <DialogContent variant="modal">
        <DialogHeader
          title="Add a job"
          description={
            reviewing
              ? "Review the extracted fields, then save."
              : "Paste a URL or the listing text — we'll pull out the structured bits."
          }
        />

        <div className="flex flex-col flex-1 min-h-0">
          {!reviewing && (
            <div className="px-6 pt-4 flex items-center gap-1">
              <TabButton active={tab === "url"} onClick={() => setTab("url")}>
                Paste URL
              </TabButton>
              <TabButton
                active={tab === "paste"}
                onClick={() => setTab("paste")}
              >
                Paste text
              </TabButton>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
                {error}
              </div>
            )}
            {hint && !error && (
              <div className="rounded-md border border-hairline bg-surface-1 px-3 py-2 text-body-sm text-ink-muted">
                {hint}
              </div>
            )}

            {!reviewing && tab === "url" && (
              <Row label="Job posting URL" htmlFor="url" required>
                <input
                  id="url"
                  type="url"
                  className={inputCls}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://boards.greenhouse.io/…"
                  disabled={pending}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && parseUrl()}
                />
                <p className="text-caption text-ink-tertiary">
                  Works well on Greenhouse, Lever, Ashby. Sites that require
                  login (LinkedIn, Workday) fall back to the Paste tab.
                </p>
              </Row>
            )}

            {!reviewing && tab === "paste" && (
              <Row label="Listing text" htmlFor="text" required>
                <textarea
                  id="text"
                  rows={12}
                  className={
                    inputCls + " resize-y min-h-[200px] font-mono text-body-sm"
                  }
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste the full job description here."
                  disabled={pending}
                  autoFocus
                />
              </Row>
            )}

            {reviewing && (
              <ReviewForm
                columns={columns}
                columnId={columnId}
                setColumnId={setColumnId}
                company={company}
                setCompany={setCompany}
                role={role}
                setRole={setRole}
                location={location}
                setLocation={setLocation}
                sourceUrl={sourceUrl}
                setSourceUrl={setSourceUrl}
                listingText={listingText}
                setListingText={setListingText}
                pending={pending}
              />
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 px-6 py-3 border-t border-hairline bg-surface-1">
            <div>
              {reviewing && (
                <Button
                  type="button"
                  variant="tertiary"
                  onClick={() => setReviewing(false)}
                  disabled={pending}
                >
                  ← Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              {!reviewing && tab === "url" && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={parseUrl}
                  disabled={pending || !urlInput.trim()}
                >
                  {pending ? "Fetching…" : "Fetch listing"}
                </Button>
              )}
              {!reviewing && tab === "paste" && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={parseText}
                  disabled={pending || textInput.trim().length < 40}
                >
                  {pending ? "Extracting…" : "Continue"}
                </Button>
              )}
              {reviewing && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={save}
                  disabled={pending || !company.trim() || !role.trim()}
                >
                  {pending ? "Saving…" : "Save job"}
                </Button>
              )}
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-md text-button transition-colors cursor-pointer",
        active
          ? "bg-surface-2 text-ink"
          : "text-ink-subtle hover:text-ink hover:bg-surface-1",
      )}
    >
      {children}
    </button>
  );
}

function ReviewForm({
  columns,
  columnId,
  setColumnId,
  company,
  setCompany,
  role,
  setRole,
  location,
  setLocation,
  sourceUrl,
  setSourceUrl,
  listingText,
  setListingText,
  pending,
}: {
  columns: ColumnDTO[];
  columnId: string;
  setColumnId: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  sourceUrl: string;
  setSourceUrl: (v: string) => void;
  listingText: string;
  setListingText: (v: string) => void;
  pending: boolean;
}) {
  return (
    <>
      <Row label="Column" htmlFor="col">
        <select
          id="col"
          value={columnId}
          onChange={(e) => setColumnId(e.target.value)}
          className={inputCls + " pr-8"}
          disabled={pending}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Row>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Row label="Company" htmlFor="company" required>
          <input
            id="company"
            className={inputCls}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={200}
            required
            disabled={pending}
          />
        </Row>
        <Row label="Role" htmlFor="role" required>
          <input
            id="role"
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={200}
            required
            disabled={pending}
          />
        </Row>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Row label="Location" htmlFor="location">
          <input
            id="location"
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            disabled={pending}
          />
        </Row>
        <Row label="Source URL" htmlFor="sourceUrl">
          <input
            id="sourceUrl"
            type="url"
            className={inputCls}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            maxLength={2000}
            disabled={pending}
          />
        </Row>
      </div>

      <Row label="Listing text" htmlFor="listing" required>
        <textarea
          id="listing"
          rows={10}
          required
          className={
            inputCls + " resize-y min-h-[180px] font-mono text-body-sm"
          }
          value={listingText}
          onChange={(e) => setListingText(e.target.value)}
          disabled={pending}
        />
      </Row>
    </>
  );
}

const inputCls =
  "w-full h-9 px-3 rounded-md " +
  "bg-canvas text-ink text-body-sm " +
  "border border-hairline focus:border-hairline-strong " +
  "placeholder:text-ink-tertiary " +
  "disabled:opacity-60";

function Row({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-caption text-ink-subtle">
        {label}
        {required && <span className="text-[var(--color-primary)] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
