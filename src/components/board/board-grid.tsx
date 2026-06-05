"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  JobCardPreview,
  SortableJobCard,
} from "./sortable-job-card";
import type { ColumnDTO } from "@/lib/columns";
import type { JobListDTO } from "@/lib/jobs";

/**
 * BoardGrid — the interactive part of the board. DnD context lives here so
 * the same drag operation can move cards within a column or across columns.
 *
 * State model:
 *   - `jobsById`: derived from props; lookup table for rendering card content.
 *   - `optimistic`: an override of "column id → ordered job ids". Set on
 *     drag-end before the mutation flies, cleared once the mutation settles
 *     (server then converges via router.refresh()).
 *
 * If `optimistic` is null we read order straight from props, so any other
 * change (add, delete, etc.) flows through without us interfering.
 */
export function BoardGrid({
  columns,
  jobsByColumn,
}: {
  columns: ColumnDTO[];
  jobsByColumn: Record<string, JobListDTO[]>;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<Record<string, string[]> | null>(
    null,
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flat id → job lookup, always derived from props (so renamed/moved fields
  // outside of drag operations stay live).
  const jobsById = useMemo(() => {
    const map: Record<string, JobListDTO> = {};
    for (const list of Object.values(jobsByColumn)) {
      for (const j of list) map[j.id] = j;
    }
    return map;
  }, [jobsByColumn]);

  // Source of truth for ordering — optimistic during a drag round-trip,
  // props-derived otherwise.
  const orderByCol: Record<string, string[]> = useMemo(() => {
    if (optimistic) return optimistic;
    const out: Record<string, string[]> = {};
    for (const col of columns) {
      out[col.id] = (jobsByColumn[col.id] ?? []).map((j) => j.id);
    }
    return out;
  }, [optimistic, columns, jobsByColumn]);

  const sensors = useSensors(
    // Activation distance keeps clicks on the card going to the link;
    // dragging only kicks in after ~8px of movement.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function findColumnOfJob(jobId: string, snapshot: Record<string, string[]>) {
    for (const [colId, ids] of Object.entries(snapshot)) {
      if (ids.includes(jobId)) return colId;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setError(null);
    setDraggingId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const snapshot = orderByCol;
    const fromCol = findColumnOfJob(activeId, snapshot);
    if (!fromCol) return;

    // The `over` can be either another job (overId is a job id) or a
    // column drop zone (overId is a column id when the column is empty).
    let toCol: string;
    let toIndex: number;
    if (snapshot[overId]) {
      // Dropped on a column container itself — append to the bottom.
      toCol = overId;
      toIndex = snapshot[toCol].length;
    } else {
      const found = findColumnOfJob(overId, snapshot);
      if (!found) return;
      toCol = found;
      toIndex = snapshot[toCol].indexOf(overId);
    }

    // No-op when dropping back at exactly the same slot.
    const fromIndex = snapshot[fromCol].indexOf(activeId);
    if (fromCol === toCol && fromIndex === toIndex) return;

    const next: Record<string, string[]> = {
      ...snapshot,
      [fromCol]: snapshot[fromCol].filter((id) => id !== activeId),
    };
    if (fromCol !== toCol) {
      next[toCol] = [...(next[toCol] ?? snapshot[toCol] ?? [])];
    } else {
      next[toCol] = next[fromCol]; // same array reference; fine for now
    }
    // Clamp toIndex AFTER the active id has been removed from the source.
    const targetList = fromCol === toCol ? next[toCol] : next[toCol];
    const clampedIndex = Math.max(0, Math.min(toIndex, targetList.length));
    targetList.splice(clampedIndex, 0, activeId);

    // Only ship the columns that actually changed.
    const payload: Record<string, string[]> = {};
    if (fromCol !== toCol) {
      payload[fromCol] = next[fromCol];
      payload[toCol] = next[toCol];
    } else {
      payload[toCol] = next[toCol];
    }

    setOptimistic(next);

    try {
      const res = await fetch("/api/jobs/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ byColumn: payload }),
      });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Reorder failed (${res.status}).`);
      }
      // Pull the canonical server state. The optimistic snapshot already
      // matches what we wrote, so visually nothing should move on refresh.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed.");
    } finally {
      // Drop the optimistic override once the round-trip is done; on success
      // the freshly-refreshed props produce the same ordering, on failure
      // we revert to the server's authoritative state.
      setOptimistic(null);
    }
  }

  // Pick a grid width that adapts to column count.
  const cols = Math.min(Math.max(columns.length, 1), 6);
  const draggingJob = draggingId ? jobsById[draggingId] : null;

  return (
    <>
      {error && (
        <div className="mb-3 rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
          {error}
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(220px, 1fr))`,
          }}
        >
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              ids={orderByCol[col.id] ?? []}
              jobsById={jobsById}
            />
          ))}
        </div>

        <DragOverlay>
          {draggingJob ? <JobCardPreview job={draggingJob} /> : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

// ----------------------------------------------------------------------------

function Column({
  column,
  ids,
  jobsById,
}: {
  column: ColumnDTO;
  ids: string[];
  jobsById: Record<string, JobListDTO>;
}) {
  return (
    <section
      aria-label={column.name}
      className="flex flex-col gap-3 min-h-[320px]"
    >
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
        <span className="text-caption text-ink-tertiary">{ids.length}</span>
      </header>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {/* A separate droppable wrapper so empty columns still accept drops. */}
        <ColumnDropZone columnId={column.id} empty={ids.length === 0}>
          {ids.length === 0 ? (
            <p className="text-body-sm text-ink-tertiary text-center leading-snug">
              No jobs here yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {ids.map((id) =>
                jobsById[id] ? (
                  <SortableJobCard key={id} job={jobsById[id]} />
                ) : null,
              )}
            </div>
          )}
        </ColumnDropZone>
      </SortableContext>
    </section>
  );
}

function ColumnDropZone({
  columnId,
  empty,
  children,
}: {
  columnId: string;
  empty: boolean;
  children: ReactNode;
}) {
  // Use a sortable container whose id IS the column id. dnd-kit then treats
  // the column itself as a drop target when its job list is empty.
  const { setNodeRef, isOver } = useSortable({
    id: columnId,
    data: { type: "column" },
    disabled: !empty, // when non-empty, dropping is handled by the inner cards
  });

  return (
    <div
      ref={setNodeRef}
      className={
        empty
          ? `flex-1 rounded-lg border border-dashed ${
              isOver ? "border-primary bg-surface-1" : "border-hairline"
            } flex items-center justify-center px-4 py-8 min-h-[160px] transition-colors`
          : "flex-1"
      }
    >
      {children}
    </div>
  );
}
