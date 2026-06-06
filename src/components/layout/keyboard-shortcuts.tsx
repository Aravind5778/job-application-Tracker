"use client";

import { useEffect } from "react";

/**
 * Minimal global keyboard shortcuts:
 *   n — open the Add-Job modal (synthesizes a click on the button marked
 *       with data-shortcut="add-job"; reuses existing UI, no portal state
 *       to lift)
 *   ? — focus the body so Tab can navigate the board (placeholder hook
 *       for a future help overlay)
 *
 * Shortcuts are suppressed when the user is typing in an input / textarea /
 * contenteditable, when a modal is open, or when a modifier key is held.
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    function isTextTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      if (t.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextTarget(e.target)) return;
      // Radix manages its own focus + key handling for open dialogs.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      if (e.key === "n" || e.key === "N") {
        const btn = document.querySelector<HTMLButtonElement>(
          'button[data-shortcut="add-job"]',
        );
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
