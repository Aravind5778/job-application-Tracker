"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { JobListDTO } from "@/lib/jobs";

/**
 * Job card that is BOTH a clickable Link AND a draggable sortable item,
 * with a right-click Delete context menu.
 *
 * - Click → drawer opens (via Link href="?job=<id>").
 * - Drag → dnd-kit takes over once the pointer moves past the 8px
 *   activation threshold set on the DndContext.
 * - Right-click → Radix ContextMenu with Delete. dnd-kit's PointerSensor
 *   is left-button only, so right-click passes through cleanly.
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
    <CardContextMenuWrapper job={job}>
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
    </CardContextMenuWrapper>
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

/**
 * Right-click Delete wrapper. Exported for reuse from StaticJobCard so
 * the pre-hydration cards accept context-menu clicks too.
 */
export function CardContextMenuWrapper({
  job,
  children,
}: {
  job: JobListDTO;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (pending) return;
    if (!confirm(`Delete ${job.company} — ${job.role}?`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 204) {
          throw new Error(`Delete failed (${res.status}).`);
        }
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Delete failed.");
      }
    });
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          destructive
          onSelect={(e) => {
            // onSelect fires before the menu closes; defer to next tick so
            // the confirm dialog doesn't fight the menu's focus return.
            e.preventDefault();
            setTimeout(onDelete, 0);
          }}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
