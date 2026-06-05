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
import type { ColumnDTO } from "@/lib/columns";

/**
 * Add-job modal. Phase 3 supports the Paste flow only — the user pastes
 * the listing text and fills in company / role manually. Phase 5 layers
 * the URL tab + auto-extraction on top of the same form.
 */
export function AddJobModal({ columns }: { columns: ColumnDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state — kept simple; if this grows we'll move to react-hook-form.
  const [columnId, setColumnId] = useState(columns[0]?.id ?? "");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [listingText, setListingText] = useState("");

  function reset() {
    setColumnId(columns[0]?.id ?? "");
    setCompany("");
    setRole("");
    setLocation("");
    setSourceUrl("");
    setListingText("");
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (!next && pending) return; // don't close mid-submit
    setOpen(next);
    if (!next) reset();
  }

  function submit(e: React.FormEvent) {
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
            source: "paste",
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
        reset();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const disabled = columns.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="primary"
          disabled={disabled}
          title={
            disabled ? "Add a column in Settings first" : "Add a job"
          }
        >
          Add job
        </Button>
      </DialogTrigger>

      <DialogContent variant="modal">
        <DialogHeader
          title="Add a job"
          description="Paste the listing text. Phase 5 will add a URL fetch tab on top of the same form."
        />

        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
                {error}
              </div>
            )}

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
                  placeholder="e.g. Cloudflare"
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
                  placeholder="e.g. Senior Platform Engineer"
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
                  placeholder="Remote, NYC, etc."
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
                  placeholder="https://…"
                />
              </Row>
            </div>

            <Row label="Listing text" htmlFor="listing" required>
              <textarea
                id="listing"
                rows={10}
                required
                className={inputCls + " resize-y min-h-[180px] font-mono text-body-sm"}
                value={listingText}
                onChange={(e) => setListingText(e.target.value)}
                disabled={pending}
                placeholder="Paste the full job description here."
              />
            </Row>
          </div>

          <footer className="flex items-center justify-end gap-2 px-6 py-3 border-t border-hairline bg-surface-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save job"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Shared form-control classes — kept here for now; extract if we add a third
// form in the app.
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
