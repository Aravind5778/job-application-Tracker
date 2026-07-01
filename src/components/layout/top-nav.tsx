import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AddJobModal } from "@/components/job/add-job-modal";
import { FindJobsModal } from "@/components/job/find-jobs-modal";
import type { ColumnDTO } from "@/lib/columns";
import { getSearchConfig } from "@/lib/search/config";

/**
 * Sticky top nav. Wordmark left, sub-nav centered, theme toggle +
 * Find-Jobs + Add-Job on the right. Client islands own their own state.
 */
export async function TopNav({ columns }: { columns: ColumnDTO[] }) {
  const searchConfig = await getSearchConfig();

  return (
    <header className="sticky top-0 z-30 h-14 bg-canvas border-b border-hairline">
      <div className="h-full mx-auto max-w-[1280px] px-6 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center" aria-label="Home">
          <BrandMark />
        </Link>

        <nav
          className="hidden md:flex items-center gap-6 text-body-sm text-ink-subtle"
          aria-label="Primary"
        >
          <Link href="/" className="hover:text-ink transition-colors">
            Board
          </Link>
          <Link href="/profile" className="hover:text-ink transition-colors">
            Profile
          </Link>
          <Link href="/settings" className="hover:text-ink transition-colors">
            Settings
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <FindJobsModal config={searchConfig} />
          <AddJobModal columns={columns} />
        </div>
      </div>
    </header>
  );
}
