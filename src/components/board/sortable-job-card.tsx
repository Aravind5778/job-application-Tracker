"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import type { JobListDTO } from "@/lib/jobs";

/**
 * Job card that is BOTH a clickable Link and a draggable item.
 *
 * dnd-kit's PointerSensor is configured with an activation distance (set on
 * the parent `DndContext`), so quick pointer-down → pointer-up sequences
 * never activate a drag, and the underlying anchor click goes through. Drags
 * only kick in once the pointer moves past the threshold.
 */
export function SortableJobCard({ job }: { job: JobListDTO }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: job.id,
    data: { type: "job", columnId: job.columnId },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <Link
      ref={setNodeRef}
      href={`/?job=${encodeURIComponent(job.id)}`}
      scroll={false}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "block rounded-lg border bg-surface-1 p-3 transition-colors",
        "border-hairline hover:bg-surface-2 hover:border-hairline-strong",
        "outline-none focus-visible:border-hairline-strong",
        "touch-none select-none cursor-grab active:cursor-grabbing",
        isDragging && "opacity-0",
      )}
    >
      <JobCardContent job={job} />
    </Link>
  );
}

/**
 * Same visual as the sortable card but inert — used by the DragOverlay so
 * the card under the cursor looks identical to the one being dragged.
 */
export function JobCardPreview({ job }: { job: JobListDTO }) {
  return (
    <div
      className="
        block rounded-lg border border-hairline-strong bg-surface-2 p-3
        shadow-xl
        rotate-1
        cursor-grabbing
      "
    >
      <JobCardContent job={job} />
    </div>
  );
}

export function JobCardContent({ job }: { job: JobListDTO }) {
  return (
    <>
      <div className="text-card-title text-ink truncate">{job.company}</div>
      <div className="text-body-sm text-ink-muted truncate mt-0.5">
        {job.role}
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {job.location && (
          <span className="inline-flex items-center text-caption text-ink-subtle bg-canvas border border-hairline rounded-sm px-1.5 py-0.5">
            {job.location}
          </span>
        )}
        {job.hasKit && (
          <span className="inline-flex items-center text-caption text-ink-subtle border border-hairline rounded-sm px-1.5 py-0.5">
            Kit ✓
          </span>
        )}
        {job.sourceUrl && (
          <span
            className="inline-flex items-center text-caption text-ink-tertiary"
            title={job.sourceUrl}
          >
            ↗
          </span>
        )}
      </div>
    </>
  );
}
