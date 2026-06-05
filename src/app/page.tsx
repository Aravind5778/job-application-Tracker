import { TopNav } from "@/components/layout/top-nav";
import { BoardShell } from "@/components/board/board-shell";
import { listColumns } from "@/lib/columns";

// Always show the live column state — nothing here is statically cacheable.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const columns = await listColumns();

  return (
    <>
      <TopNav />
      <BoardShell columns={columns} />
    </>
  );
}
