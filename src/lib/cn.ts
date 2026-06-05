/**
 * Minimal className combiner — joins truthy strings with spaces.
 *
 * Avoids a `clsx` / `tailwind-merge` dependency for now; if we ever need
 * conflict-aware merging (one Tailwind class overriding another by precedence),
 * add `tailwind-merge` and swap this implementation.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
