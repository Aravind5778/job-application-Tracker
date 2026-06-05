import type { ReactNode } from "react";

/**
 * Phase-1 board shell — renders the four seeded columns with empty states
 * so we can validate the Linear chrome (canvas, hairlines, eyebrow typography,
 * surface-1 lifts) before Phase 2 wires up real data.
 *
 * Per design.md: columns are NOT lifted onto a surface. They live directly on
 * the canvas and are distinguished by their eyebrow header. Only the cards
 * themselves get surface-1 treatment.
 */
const SEED_COLUMNS = [
  { id: "wishlist", name: "Wishlist", hint: "Roles you want to explore." },
  { id: "applied", name: "Applied", hint: "Applications sent." },
  {
    id: "interviewing",
    name: "Interviewing",
    hint: "Active conversations.",
  },
  { id: "rejected", name: "Rejected", hint: "Closed loops." },
];

export function BoardShell() {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SEED_COLUMNS.map((col) => (
            <ColumnPlaceholder key={col.id} name={col.name} hint={col.hint} />
          ))}
        </div>
      </div>
    </main>
  );
}

function ColumnPlaceholder({ name, hint }: { name: string; hint: string }) {
  return (
    <section
      aria-label={name}
      className="flex flex-col gap-3 min-h-[320px]"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-eyebrow text-ink-subtle uppercase">{name}</h2>
        <span className="text-caption text-ink-tertiary">0</span>
      </header>

      <EmptyDropZone>
        <p className="text-body-sm text-ink-tertiary text-center leading-snug">
          {hint}
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
