"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ColumnDTO } from "@/lib/columns";

/**
 * Settings → Columns editor. Server passes the initial column list; this
 * component does all mutations against the `/api/columns/*` endpoints and
 * refreshes the route afterward so the rest of the app (board, etc.) picks
 * up the change.
 *
 * Reorder UI is intentionally up/down arrows here — the board itself gets
 * full drag-and-drop in Phase 4; columns rarely move, so two clicks per row
 * is fine for now.
 */
export function ColumnsEditor({ initialColumns }: { initialColumns: ColumnDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // We render off the prop directly; after every mutation we call
  // router.refresh() to re-pull from the server. The transition keeps the UI
  // interactive while the route re-renders.
  const columns = initialColumns;

  async function call(path: string, init?: RequestInit): Promise<void> {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      const msg =
        typeof data === "object" && data && "error" in data
          ? String((data as { error: unknown }).error)
          : `Request failed (${res.status}).`;
      throw new Error(msg);
    }
  }

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function add() {
    if (!draftName.trim()) return;
    run(async () => {
      await call("/api/columns", {
        method: "POST",
        body: JSON.stringify({ name: draftName }),
      });
      setDraftName("");
    });
  }

  function saveRename(id: string) {
    run(async () => {
      await call(`/api/columns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingName }),
      });
      setEditingId(null);
      setEditingName("");
    });
  }

  function remove(id: string) {
    // No confirm — user explicitly asked for one-click delete. Deleting a
    // column still cascades to its jobs via the Prisma relation.
    run(async () => {
      await call(`/api/columns/${id}`, { method: "DELETE" });
    });
  }

  function toggleTerminal(id: string, current: boolean) {
    run(async () => {
      await call(`/api/columns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isTerminal: !current }),
      });
    });
  }

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= columns.length) return;
    const ids = columns.map((c) => c.id);
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    run(async () => {
      await call("/api/columns/reorder", {
        method: "POST",
        body: JSON.stringify({ orderedIds: ids }),
      });
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-hairline-strong bg-surface-2 px-3 py-2 text-body-sm text-ink">
          {error}
        </div>
      )}

      <ul className="rounded-lg border border-hairline bg-surface-1 divide-y divide-hairline">
        {columns.length === 0 && (
          <li className="px-4 py-6 text-body-sm text-ink-tertiary text-center">
            No columns yet. Add one below.
          </li>
        )}

        {columns.map((col, idx) => {
          const isEditing = editingId === col.id;
          return (
            <li
              key={col.id}
              className="flex items-center gap-2 px-3 py-2"
            >
              <span className="text-caption text-ink-tertiary w-6 tabular-nums">
                {idx + 1}
              </span>

              {isEditing ? (
                <input
                  autoFocus
                  className="flex-1 h-8 px-2 rounded-md bg-canvas border border-hairline-strong text-ink text-body-sm"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(col.id);
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditingName("");
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left text-body-sm text-ink truncate cursor-text"
                  onClick={() => {
                    setEditingId(col.id);
                    setEditingName(col.name);
                  }}
                  title="Click to rename"
                >
                  {col.name}
                </button>
              )}

              <label
                className={cn(
                  "flex items-center gap-1.5 text-caption select-none cursor-pointer",
                  col.isTerminal ? "text-[var(--color-success)]" : "text-ink-tertiary",
                )}
                title="Mark as the happy-path closing column (e.g. Offer). Cards here get a success accent."
              >
                <input
                  type="checkbox"
                  className="accent-[var(--color-success)]"
                  checked={col.isTerminal}
                  onChange={() => toggleTerminal(col.id, col.isTerminal)}
                  disabled={pending}
                />
                terminal
              </label>

              <div className="flex items-center gap-1">
                <IconButton
                  label="Move up"
                  disabled={pending || idx === 0}
                  onClick={() => move(idx, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={pending || idx === columns.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  ↓
                </IconButton>

                {isEditing ? (
                  <Button
                    variant="primary"
                    onClick={() => saveRename(col.id)}
                    disabled={pending}
                  >
                    Save
                  </Button>
                ) : (
                  <IconButton
                    label="Delete column"
                    disabled={pending}
                    onClick={() => remove(col.id)}
                  >
                    ×
                  </IconButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="flex-1 h-9 px-3 rounded-md bg-surface-1 border border-hairline text-ink text-body-sm placeholder:text-ink-tertiary"
          placeholder="New column name (e.g. Offer)"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          maxLength={60}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !draftName.trim()}>
          Add column
        </Button>
      </form>
    </div>
  );
}

function IconButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="
        inline-flex items-center justify-center
        h-7 w-7 rounded-md
        text-ink-subtle hover:text-ink hover:bg-surface-2
        disabled:opacity-30 disabled:cursor-not-allowed
        transition-colors cursor-pointer
      "
    >
      {children}
    </button>
  );
}
