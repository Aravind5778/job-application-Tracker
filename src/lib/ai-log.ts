/**
 * Read-only accessors for the AiLog table — used by the Settings page so
 * the user can see what every AI call cost them.
 */
import { prisma } from "./db";

export type AiLogEntry = {
  id: string;
  createdAt: string;
  jobId: string | null;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  estCostCents: number;
  error: string | null;
};

export async function listAiLog(limit = 30): Promise<AiLogEntry[]> {
  const rows = await prisma.aiLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    jobId: r.jobId,
    model: r.model,
    operation: r.operation,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens,
    latencyMs: r.latencyMs,
    estCostCents: r.estCostCents,
    error: r.error,
  }));
}

export async function totalSpendCents(): Promise<number> {
  const agg = await prisma.aiLog.aggregate({ _sum: { estCostCents: true } });
  return agg._sum.estCostCents ?? 0;
}
