import type { ReactNode } from "react";
import Link from "next/link";
import type { ColumnDTO } from "@/lib/columns";

/**
 * Board shell — renders the columns from the DB with empty card slots.
 * Phase 4 will replace the placeholders with real cards + drag-and-drop.
 *
 * Per design.md: columns are NOT lifted onto a surface. They live directly
 * on the canvas and are distinguished by their eyebrow header. Only cards
 * get surface-1 treatment.
 *
 * Terminal columns (the user's chosen "happy-path" close, e.g. Offer) get
 * a success-green eyebrow accent — the only chromatic exception per the
 * design system.
 */
export function BoardShell({ columns }: { columns: ColumnDTO[] }) {
  return (
    <main className="flex-1 flex flex-col">
      <div className="mx-auto w-full max-w-[1280px] px-6 pt-12 pb-6">
        <p className="text-eyebrow text-ink-subtle uppercase">Pipeline</p>
        <h1 className="text-display-md text-ink mt-2">Your job search board</h1>
        <p className="text-body-lg text-ink-muted mt-3 max-w-[640px]">
          Drag jobs across stages, paste a listing to add a card, then generate
          a tailored application kit with one click.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-12 flex-1">
        {columns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {columns.map((col) => (
              <ColumnPlaceholder key={col.id} column={col} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ColumnPlaceholder({ column }: { column: ColumnDTO }) {
  return (
    <section aria-label={column.name} className="flex flex-col gap-3 min-h-[320px]">
      <header className="flex items-center justify-between">
        <h2
          className={
            column.isTerminal
              ? "text-eyebrow uppercase text-[var(--color-success)]"
              : "text-eyebrow uppercase text-ink-subtle"
          }
        >
          {column.name}
        </h2>
        <span className="text-caption text-ink-tertiary">0</span>
      </header>

      <EmptyDropZone>
        <p className="text-body-sm text-ink-tertiary text-center leading-snug">
          No jobs here yet.
        </p>
      </EmptyDropZone>
    </section>
  );
}

function EmptyDropZone({ children }: { children: ReactNode }) {
  return (
    <div
      className="
        flex-1 rounded-lg border border-dashed border-hairline
        bg-transparent
        flex items-center justify-center
        px-4 py-8
        min-h-[200px]
      "
    >
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-12 text-center">
      <p className="text-body text-ink-muted">
        You don&apos;t have any pipeline columns yet.
      </p>
      <Link
        href="/settings"
        className="inline-block mt-3 text-body-sm text-primary hover:text-primary-hover"
      >
        Go to Settings to add some →
      </Link>
    </div>
  );
}
