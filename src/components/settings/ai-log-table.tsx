import type { AiLogEntry } from "@/lib/ai-log";

/**
 * Read-only recent-AI-calls table for /settings. Server-rendered; no
 * interactivity needed.
 */
export function AiLogTable({
  entries,
  totalCents,
}: {
  entries: AiLogEntry[];
  totalCents: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-body-sm text-ink-tertiary">
        No AI calls yet. Generate a kit on the board to see usage here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-muted">
        Lifetime spend (estimated):{" "}
        <span className="text-ink">${(totalCents / 100).toFixed(2)}</span>
      </p>

      <div className="rounded-lg border border-hairline bg-surface-1 overflow-hidden">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-hairline text-caption text-ink-subtle uppercase">
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Operation</th>
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-right px-3 py-2 font-medium">In</th>
              <th className="text-right px-3 py-2 font-medium">Cache</th>
              <th className="text-right px-3 py-2 font-medium">Out</th>
              <th className="text-right px-3 py-2 font-medium">Latency</th>
              <th className="text-right px-3 py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const cacheTotal = e.cacheReadTokens + e.cacheWriteTokens;
              return (
                <tr key={e.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-2 text-ink-muted whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-ink">{e.operation}</td>
                  <td className="px-3 py-2 text-ink-muted truncate max-w-[160px]">
                    {e.model.replace(/^claude-/, "")}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-muted tabular-nums">
                    {e.inputTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-muted tabular-nums">
                    {cacheTotal > 0 ? cacheTotal.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-muted tabular-nums">
                    {e.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-muted tabular-nums">
                    {(e.latencyMs / 1000).toFixed(1)}s
                  </td>
                  <td className="px-3 py-2 text-right text-ink tabular-nums">
                    {e.error
                      ? "—"
                      : `$${(e.estCostCents / 100).toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
