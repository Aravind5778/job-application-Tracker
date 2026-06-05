import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Sticky top nav per Linear's `top-nav` spec: 56px tall, canvas background,
 * wordmark on the left, secondary + primary CTA pair on the right.
 * Sub-nav links live in the middle for later phases (Profile, Settings).
 */
export function TopNav() {
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
          <Link
            href="/"
            className="hover:text-ink transition-colors"
          >
            Board
          </Link>
          <Link
            href="/profile"
            className="hover:text-ink transition-colors"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            className="hover:text-ink transition-colors"
          >
            Settings
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="primary" disabled title="Wired up in Phase 3">
            Add job
          </Button>
        </div>
      </div>
    </header>
  );
}
