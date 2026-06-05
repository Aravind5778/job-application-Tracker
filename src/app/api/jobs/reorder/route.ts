import { NextResponse } from "next/server";
import { reorderJobs } from "@/lib/jobs";

/**
 * Bulk reorder endpoint.
 *
 * Body shape:
 *   { byColumn: { [columnId: string]: string[] /* job ids top→bottom *\/ } }
 *
 * Only columns whose contents changed need to be present. The client should
 * include both source and destination columns when a card crosses columns.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { byColumn } = (body ?? {}) as { byColumn?: unknown };
  if (
    !byColumn ||
    typeof byColumn !== "object" ||
    Array.isArray(byColumn)
  ) {
    return NextResponse.json(
      { error: "`byColumn` must be an object keyed by column id." },
      { status: 400 },
    );
  }

  const normalized: Record<string, string[]> = {};
  for (const [columnId, ids] of Object.entries(byColumn)) {
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
      return NextResponse.json(
        { error: `Column "${columnId}" must map to an array of job ids.` },
        { status: 400 },
      );
    }
    normalized[columnId] = ids as string[];
  }

  await reorderJobs(normalized);
  return new NextResponse(null, { status: 204 });
}
