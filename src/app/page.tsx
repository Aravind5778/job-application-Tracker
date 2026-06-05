import { TopNav } from "@/components/layout/top-nav";
import { BoardShell } from "@/components/board/board-shell";
import { JobDetailDrawer } from "@/components/job/job-detail-drawer";
import { listColumns } from "@/lib/columns";
import { listJobs, type JobListDTO } from "@/lib/jobs";

// Always show the live state — both columns and jobs are user-mutable.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [columns, jobs] = await Promise.all([listColumns(), listJobs()]);

  // Group jobs by column server-side so client islands stay slim.
  const jobsByColumn: Record<string, JobListDTO[]> = {};
  for (const col of columns) jobsByColumn[col.id] = [];
  for (const job of jobs) {
    (jobsByColumn[job.columnId] ??= []).push(job);
  }

  return (
    <>
      <TopNav columns={columns} />
      <BoardShell columns={columns} jobsByColumn={jobsByColumn} />
      <JobDetailDrawer columns={columns} />
    </>
  );
}
