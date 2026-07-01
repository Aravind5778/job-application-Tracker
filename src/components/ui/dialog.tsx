"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Thin Radix-Dialog wrapper themed for the Linear dark canvas.
 *
 * Two presentations:
 *   - `Dialog` (default)  → centered modal, 24px radius, surface-1 panel.
 *   - `Drawer` (variant)  → right-side sliding panel, full-height.
 *
 * Both share the same overlay scrim and Escape/click-outside semantics.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

type Variant = "modal" | "drawer";

const overlay =
  "fixed inset-0 z-40 bg-[var(--color-overlay)] " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

const variantContent: Record<Variant, string> = {
  modal:
    "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 " +
    "w-[min(720px,calc(100vw-32px))] max-h-[calc(100vh-64px)] " +
    "rounded-xl border border-hairline bg-surface-1 shadow-2xl " +
    "flex flex-col overflow-hidden",
  // Full-screen "page" — cover the whole viewport, canvas background,
  // no border. The caller supplies its own top bar (usually with a
  // Back arrow) since the DialogHeader default has a close × that
  // doesn't fit a full-page treatment.
  drawer:
    "fixed inset-0 z-50 bg-canvas flex flex-col overflow-hidden",
};

export function DialogContent({
  variant = "modal",
  className,
  children,
}: {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn("z-50 text-ink", variantContent[variant], className)}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  title,
  description,
  trailing,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-hairline">
      <div className="min-w-0 flex-1">
        <DialogTitle className="text-card-title text-ink truncate">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-body-sm text-ink-subtle mt-1">
            {description}
          </DialogDescription>
        )}
      </div>
      {trailing}
      <DialogClose
        aria-label="Close"
        className="
          inline-flex items-center justify-center
          h-7 w-7 rounded-md
          text-ink-subtle hover:text-ink hover:bg-surface-2
          transition-colors cursor-pointer
        "
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </DialogClose>
    </header>
  );
}
