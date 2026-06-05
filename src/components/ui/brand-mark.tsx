/**
 * Small brand mark for the top nav. Lavender-on-canvas glyph + wordmark.
 * The glyph is intentionally simple — a stacked stripe motif suggesting
 * a Kanban column. Lavender is reserved per design.md so this is one of
 * the few places it's allowed to appear as a fill.
 */
export function BrandMark() {
  return (
    <div className="inline-flex items-center gap-2 select-none">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden
        className="text-primary"
      >
        <rect x="2" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
        <rect
          x="8"
          y="3"
          width="4"
          height="10"
          rx="1.5"
          fill="currentColor"
          opacity="0.7"
        />
        <rect
          x="14"
          y="3"
          width="4"
          height="6"
          rx="1.5"
          fill="currentColor"
          opacity="0.4"
        />
      </svg>
      <span className="text-ink text-button tracking-tight font-medium">
        Job Search Copilot
      </span>
    </div>
  );
}
