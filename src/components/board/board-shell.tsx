import Link from "next/link";
import type { ColumnDTO } from "@/lib/columns";
import type { JobListDTO } from "@/lib/jobs";
import { BoardGrid } from "./board-grid";

/**
 * Server-rendered board chrome — the header copy + an empty-state. The
 * actual interactive grid (DnD, optimistic state) lives in BoardGrid as a
 * client island.
 *
 * Per design.md: the page background is canvas; columns are NOT lifted onto
 * a surface — only the cards inside them. Terminal columns are the one
 * chromatic exception (success-green eyebrow).
 */
export function BoardShell({
  columns,
  jobsByColumn,
}: {
  columns: ColumnDTO[];
  jobsByColumn: Record<string, JobListDTO[]>;
}) {
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
          <BoardGrid columns={columns} jobsByColumn={jobsByColumn} />
        )}
      </div>
    </main>
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
