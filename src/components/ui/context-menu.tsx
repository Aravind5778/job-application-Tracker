"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Thin Radix ContextMenu wrapper themed for the Linear dark canvas.
 * Right-click any wrapped element to open; auto-positioned, focus-trapped,
 * Escape/click-outside to dismiss.
 */

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const contentCls =
  "z-50 min-w-[180px] rounded-md border border-hairline bg-surface-2 " +
  "shadow-xl py-1 " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 " +
  "text-body-sm text-ink";

export function ContextMenuContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn(contentCls, className)}>
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

const itemBase =
  "flex items-center gap-2 h-8 px-3 rounded-sm mx-1 " +
  "text-body-sm outline-none cursor-pointer " +
  "data-[highlighted]:bg-surface-3 " +
  "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed";

export function ContextMenuItem({
  className,
  destructive,
  ...rest
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
  destructive?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        itemBase,
        destructive ? "text-ink-muted data-[highlighted]:text-ink" : "text-ink",
        className,
      )}
      {...rest}
    />
  );
}
