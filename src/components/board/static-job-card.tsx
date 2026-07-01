"use client";

import Link from "next/link";
import {
  CardContextMenuWrapper,
  JobCardContent,
} from "./sortable-job-card";
import type { JobListDTO } from "@/lib/jobs";

/**
 * Non-sortable version of the job card. Identical visual to
 * SortableJobCard, but WITHOUT the useSortable hook — so no
 * `aria-describedby="DndDescribedBy-N"` attribute whose N would differ
 * between the SSR pass and the first client render.
 *
 * BoardGrid renders StaticJobCard during SSR / pre-mount and swaps to
 * SortableJobCard after `useEffect(() => setMounted(true), [])`, which
 * eliminates the hydration mismatch dnd-kit's internal ID counter causes.
 *
 * The right-click Delete menu (CardContextMenuWrapper) works here too so
 * the behavior is consistent across the two rendering modes.
 */
export function StaticJobCard({ job }: { job: JobListDTO }) {
  return (
    <CardContextMenuWrapper job={job}>
      <Link
        href={`/?job=${encodeURIComponent(job.id)}`}
        scroll={false}
        className="
          block rounded-lg border border-hairline bg-surface-1 p-3
          hover:bg-surface-2 hover:border-hairline-strong
          transition-colors
          outline-none focus-visible:border-hairline-strong
        "
      >
        <JobCardContent job={job} />
      </Link>
    </CardContextMenuWrapper>
  );
}
